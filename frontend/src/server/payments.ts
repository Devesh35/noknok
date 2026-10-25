import "server-only";
import { randomCode } from "@/lib/ids";
import type { Handoff, PaymentProvider, VerifyResult } from "@/lib/payments/types";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { expirePendingJoin, releaseSpot, settlePendingJoin, takeSpot } from "@/server/joins.shared";
import { ActivityModel, JoinModel, PaymentModel, WebhookEventModel, type JoinDoc, type PaymentDoc } from "@/server/models";
import { notify } from "@/server/notify";
import { gatewayFor, selectGateway, type CheckoutInput, type GatewayEvent } from "@/server/payments/gateway";
import { fail } from "@/server/respond";

// The provider-agnostic half of taking money: which join a payment belongs
// to, settling, expiring, the late-capture rule and webhook idempotency.
// Provider specifics live in src/server/payments/*. Nothing here runs a
// gateway call inside a transaction.

// UPI approvals can take a while to confirm; the spot stays held this long,
// counted from when the join was made.
const PENDING_HOLD_MS = 30 * 60 * 1000;
const POLL_BATCH = 50;

type GatewayName = Exclude<PaymentProvider, "fake">;

// True when paid joins settle instantly (development and tests).
export function paymentsAreFake(): boolean {
  return selectGateway().provider === "fake";
}

// Creates the gateway order for a held spot and records it.
export async function createPayment(join: JoinDoc, amountP: number): Promise<Handoff> {
  const gateway = selectGateway();
  if (gateway.provider === "fake") return { kind: "captured" };
  const merchantOrderId = `mo_${randomCode(12)}`;
  const order = await gateway.createOrder({
    joinId: join._id,
    merchantOrderId,
    amountP,
    returnUrl: `${config.APP_URL}/pay/return?mo=${merchantOrderId}`,
  });
  await connectDb();
  await PaymentModel.create({
    _id: `pay_${randomCode(10)}`,
    joinId: join._id,
    provider: gateway.provider,
    merchantOrderId,
    providerOrderId: order.providerOrderId,
    amountP,
    status: "created",
  });
  return order.handoff;
}

// The joiner asked to join again while their spot is still held: hand back
// the open order instead of making a second one.
export async function resumePayment(joinId: string): Promise<Handoff | null> {
  await connectDb();
  const payment = await PaymentModel.findOne({ joinId, status: "created" }).sort({ createdAt: -1 }).lean();
  return payment ? gatewayFor(payment.provider).resume(payment) : null;
}

async function paymentFor(input: CheckoutInput): Promise<PaymentDoc | null> {
  return "merchantOrderId" in input
    ? PaymentModel.findOne({ merchantOrderId: input.merchantOrderId }).lean()
    : PaymentModel.findOne({ provider: "razorpay", providerOrderId: input.razorpay_order_id }).lean();
}

// Money arrived for a join that can't become a ticket any more (the hold
// lapsed and the plan is full, or the joiner left / was removed / the plan
// was cancelled while they were paying). Keep the capture on record so the
// refund has something to act on, then give it all back.
async function captureAndRefund(payment: PaymentDoc, join: JoinDoc, providerPaymentId: string): Promise<void> {
  await PaymentModel.updateOne(
    { _id: payment._id, status: "created" },
    { $set: { status: "captured", providerPaymentId } },
  );
  await audit(join.userId, "payment.capture", "payment", payment._id, { joinId: join._id, orphaned: true });
  await refundPayment(join, payment.amountP);
}

// The gateway says the money arrived. A late capture after the hold lapsed
// still gets a spot if one is free; otherwise it is refunded in full. A
// capture for a join that is already over (left, host_cancelled) is refunded
// too: that money never bought a spot.
async function capture(payment: PaymentDoc, providerPaymentId: string): Promise<void> {
  const join = await JoinModel.findById(payment.joinId).lean();
  if (!join || join.status === "going") return;
  // True when this call took a spot for an expired join: on failure the
  // spot has to go back, unless a parallel capture used it.
  let revived = false;
  if (join.status === "expired") {
    const taken = await takeSpot(join.activityId);
    if (!taken) {
      await captureAndRefund(payment, join, providerPaymentId);
      return;
    }
    // Two deliveries of the same capture race here; only one revives.
    const result = await JoinModel.updateOne(
      { _id: join._id, status: "expired" },
      { $set: { status: "pending_payment" } },
    );
    if (!result.modifiedCount) {
      await releaseSpot(join.activityId);
      return;
    }
    revived = true;
    join.status = "pending_payment";
  }
  if (join.status !== "pending_payment") {
    await captureAndRefund(payment, join, providerPaymentId);
    return;
  }
  try {
    await settlePendingJoin(join, payment._id, providerPaymentId);
  } catch (error) {
    const after = await JoinModel.findById(join._id).select("status").lean();
    // A parallel capture settled it first and used the spot taken above.
    if (after?.status === "going") return;
    if (revived) {
      // Back to where it was, so the retry (redelivery or poll) takes a spot
      // again instead of settling a join that no longer holds one.
      await JoinModel.updateOne({ _id: join._id, status: "pending_payment" }, { $set: { status: "expired" } });
      await releaseSpot(join.activityId);
    }
    throw error;
  }
  await audit(join.userId, "payment.capture", "payment", payment._id, { joinId: join._id });
}

// The gateway says the payment failed: the spot goes back. `tell` is for
// failures found in the background, when the joiner isn't watching.
async function markFailed(payment: PaymentDoc, tell: boolean): Promise<void> {
  await PaymentModel.updateOne({ _id: payment._id, status: "created" }, { $set: { status: "failed" } });
  const join = await JoinModel.findById(payment.joinId).lean();
  if (join?.status !== "pending_payment") return;
  const expired = await expirePendingJoin(join);
  if (!expired || !tell) return;
  const activity = await ActivityModel.findById(join.activityId).select("title").lean();
  await notify(
    join.userId,
    "payment_failed",
    "Your payment didn't go through",
    `Nothing was charged and your spot at ${activity?.title ?? "the plan"} was released. Try again if there's room.`,
    `/party/${join.activityId}`,
    `payment_failed:${payment._id}`,
  );
}

// The browser is back from the gateway (modal or UPI app switch).
export async function verifyPayment(me: { _id: string }, input: CheckoutInput): Promise<VerifyResult> {
  await connectDb();
  const payment = await paymentFor(input);
  const join = payment ? await JoinModel.findById(payment.joinId).lean() : null;
  if (!payment || !join || join.userId !== me._id) fail("NOT_FOUND", "No such payment");
  const activityId = join.activityId;
  if (join.status === "going") return { state: "captured", activityId };

  const outcome = await gatewayFor(payment.provider).verifyCheckout(payment, input);
  if (outcome.state === "failed") {
    await markFailed(payment, false);
    fail("PAYMENT_FAILED", "The payment didn't go through");
  }
  if (outcome.state === "pending") {
    // Keep the spot while the gateway makes up its mind; the job tick
    // finishes the job if the joiner gives up waiting.
    await JoinModel.updateOne(
      { _id: join._id, status: "pending_payment" },
      { $max: { expiresAt: new Date(join.createdAt.getTime() + PENDING_HOLD_MS) } },
    );
    return { state: "pending", activityId };
  }
  await capture(payment, outcome.providerPaymentId);
  const after = await JoinModel.findById(join._id).select("status").lean();
  if (after?.status !== "going") fail("PAYMENT_FAILED", "The hold on your spot lapsed. Your payment will be refunded.");
  return { state: "captured", activityId };
}

// Refunds whatever was captured for this join through the gateway that took
// it. No captured payment (free plan, fake gateway) means nothing to do.
// The amount owed is written before the gateway is asked, so a gateway
// fault leaves a record that retryOwedRefunds() picks up on the next tick
// instead of a joiner who was told "refund on its way" and never got one.
export async function refundPayment(join: Pick<JoinDoc, "_id">, amountP: number): Promise<void> {
  await connectDb();
  const payment = await PaymentModel.findOne({ joinId: join._id, status: "captured" }).lean();
  if (!payment) return;
  await PaymentModel.updateOne({ _id: payment._id, status: "captured" }, { $set: { refundOwedP: amountP } });
  if (await claimRefund(payment._id)) await issueRefund(payment, amountP);
}

// Two ticks can overlap (two schedulers, or one slower than the interval),
// and a tick can overlap the request that owed the refund. Whoever flips
// refundAttemptAt does the gateway call; the claim lapses so a crash
// mid-refund is retried, after the gateway has had time to settle.
const REFUND_CLAIM_MS = 10 * 60 * 1000;

async function claimRefund(paymentId: string): Promise<boolean> {
  const nowMs = Date.now();
  const claimed = await PaymentModel.updateOne(
    {
      _id: paymentId,
      status: "captured",
      refundOwedP: { $exists: true },
      $or: [{ refundAttemptAt: { $exists: false } }, { refundAttemptAt: { $lt: new Date(nowMs - REFUND_CLAIM_MS) } }],
    },
    { $set: { refundAttemptAt: new Date(nowMs) } },
  );
  return claimed.modifiedCount === 1;
}

async function issueRefund(payment: PaymentDoc, amountP: number): Promise<void> {
  const { providerRefundId } = await gatewayFor(payment.provider).refund(payment, amountP);
  await PaymentModel.updateOne(
    { _id: payment._id },
    {
      $set: { status: amountP >= payment.amountP ? "refunded" : "partially_refunded", providerRefundId },
      $unset: { refundOwedP: 1, refundAttemptAt: 1 },
    },
  );
}

// Job tick: retries refunds whose gateway call failed. Each one is isolated
// so a single gateway fault doesn't stop the rest.
export async function retryOwedRefunds(): Promise<void> {
  await connectDb();
  const owed = await PaymentModel.find({ status: "captured", refundOwedP: { $exists: true } })
    .limit(POLL_BATCH)
    .lean();
  for (const payment of owed) {
    if (!(await claimRefund(payment._id))) continue;
    try {
      await issueRefund(payment, payment.refundOwedP ?? payment.amountP);
    } catch (error) {
      console.error(`Refund for payment ${payment._id} failed again`, error);
    }
  }
}

// A refund the caller can't do anything about failing right now (the joiner
// has already been told, the join is already closed): log it and let the
// tick retry. Used by every "refund then carry on" path.
export async function refundOrDefer(join: Pick<JoinDoc, "_id">, amountP: number): Promise<void> {
  try {
    await refundPayment(join, amountP);
  } catch (error) {
    console.error(`Refund for join ${join._id} deferred to the job tick`, error);
  }
}

// Authenticates and reads a webhook. null = not from the gateway.
export function parseWebhook(provider: GatewayName, rawBody: string, headers: Headers): Promise<GatewayEvent | null> {
  return gatewayFor(provider).parseWebhook(rawBody, headers);
}

async function paymentForEvent(provider: GatewayName, event: GatewayEvent): Promise<PaymentDoc | null> {
  if (event.merchantOrderId) return PaymentModel.findOne({ merchantOrderId: event.merchantOrderId }).lean();
  if (event.providerOrderId) return PaymentModel.findOne({ provider, providerOrderId: event.providerOrderId }).lean();
  if (event.providerPaymentId) {
    return PaymentModel.findOne({ provider, providerPaymentId: event.providerPaymentId }).lean();
  }
  return null;
}

// Idempotent: `${provider}:${eventId}` is the primary key of webhook_events,
// so a redelivery of an event that was handled stops at the insert (AGENTS-B
// rule 7). One whose handling threw (processedAt unset) is handled again:
// the gateway redelivers until it gets a 200 and this is the retry.
export async function handleGatewayEvent(provider: GatewayName, event: GatewayEvent, rawBody: string): Promise<void> {
  await connectDb();
  const id = `${provider}:${event.eventId}`;
  try {
    await WebhookEventModel.create({
      _id: id,
      provider,
      event: event.event,
      payload: JSON.parse(rawBody),
      receivedAt: new Date(),
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const seen = await WebhookEventModel.findById(id).select("processedAt").lean();
    if (seen?.processedAt) return;
  }

  const payment = await paymentForEvent(provider, event);
  if (payment) {
    switch (event.kind) {
      case "captured":
        await capture(payment, event.providerPaymentId ?? payment.providerOrderId);
        break;
      case "failed":
        // One failed attempt doesn't end the order: Razorpay lets the joiner
        // retry inside the sheet they're looking at, and a retry that
        // succeeds would then land on an expired join. The hold timer (and
        // pollPendingPayments) decide when the spot goes back.
        break;
      case "refunded": {
        const amountP = event.amountP ?? payment.amountP;
        await PaymentModel.updateOne(
          { _id: payment._id },
          {
            $set: {
              status: amountP >= payment.amountP ? "refunded" : "partially_refunded",
              ...(event.providerRefundId ? { providerRefundId: event.providerRefundId } : {}),
            },
          },
        );
        await JoinModel.updateOne({ _id: payment.joinId }, { $set: { refundedP: amountP } });
        break;
      }
    }
  }
  await WebhookEventModel.updateOne({ _id: id }, { $set: { processedAt: new Date() } });
}

// Job tick: asks the gateway about every spot still held for a payment, so a
// closed tab or a missed webhook still ends in the right state. Also retries
// refunds the gateway refused earlier.
export async function pollPendingPayments(): Promise<void> {
  await connectDb();
  await retryOwedRefunds();
  const held = await JoinModel.find({ status: "pending_payment" }).select("_id").limit(POLL_BATCH).lean();
  if (!held.length) return;
  const payments = await PaymentModel.find({ joinId: { $in: held.map((j) => j._id) }, status: "created" }).lean();
  for (const payment of payments) {
    try {
      const outcome = await gatewayFor(payment.provider).verifyCheckout(payment, {
        merchantOrderId: payment.merchantOrderId,
      });
      if (outcome.state === "captured") await capture(payment, outcome.providerPaymentId);
      else if (outcome.state === "failed") await markFailed(payment, true);
    } catch (error) {
      // One gateway hiccup must not stop the rest of the tick.
      console.error(`Polling payment ${payment._id} failed`, error);
    }
  }
}
