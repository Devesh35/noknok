import "server-only";
import { randomCode } from "@/lib/ids";
import type { Handoff, PaymentProvider, VerifyResult } from "@/lib/payments/types";
import { audit } from "@/server/audit";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { expirePendingJoin, settlePendingJoin, takeSpot } from "@/server/joins.shared";
import { ActivityModel, JoinModel, PaymentModel, WebhookEventModel, type JoinDoc, type PaymentDoc } from "@/server/models";
import { notify } from "@/server/notify";
import { gatewayFor, selectGateway, type CheckoutInput, type GatewayEvent } from "@/server/payments/gateway";
import { fail } from "@/server/respond";

// The provider-agnostic half of taking money: which join a payment belongs
// to, settling, expiring, the late-capture rule and webhook idempotency.
// Provider specifics live in src/server/payments/*. Nothing here runs a
// gateway call inside a transaction.

// A redirect gateway can take a while to confirm (UPI approvals); the spot
// stays held this long, counted from when the join was made.
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
    redirectUrl: order.redirectUrl,
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

// The gateway says the money arrived. A late capture after the hold lapsed
// still gets a spot if one is free; otherwise it is refunded in full.
async function capture(payment: PaymentDoc, providerPaymentId: string): Promise<void> {
  const join = await JoinModel.findById(payment.joinId).lean();
  if (!join || join.status === "going") return;
  if (join.status === "expired") {
    const taken = await takeSpot(join.activityId);
    if (!taken) {
      await PaymentModel.updateOne({ _id: payment._id }, { $set: { status: "captured", providerPaymentId } });
      await refundPayment(join, payment.amountP);
      return;
    }
    await JoinModel.updateOne({ _id: join._id }, { $set: { status: "pending_payment" } });
    join.status = "pending_payment";
  }
  if (join.status !== "pending_payment") return;
  await settlePendingJoin(join, payment._id, providerPaymentId);
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

// The browser is back from the gateway (modal, redirect or UPI app switch).
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
export async function refundPayment(join: Pick<JoinDoc, "_id">, amountP: number): Promise<void> {
  await connectDb();
  const payment = await PaymentModel.findOne({ joinId: join._id, status: "captured" }).lean();
  if (!payment) return;
  const { providerRefundId } = await gatewayFor(payment.provider).refund(payment, amountP);
  await PaymentModel.updateOne(
    { _id: payment._id },
    { $set: { status: amountP >= payment.amountP ? "refunded" : "partially_refunded", providerRefundId } },
  );
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
// so a redelivery stops at the insert (AGENTS-B rule 7).
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
    if ((error as { code?: number }).code === 11000) return;
    throw error;
  }

  const payment = await paymentForEvent(provider, event);
  if (payment) {
    switch (event.kind) {
      case "captured":
        await capture(payment, event.providerPaymentId ?? payment.providerOrderId);
        break;
      case "failed":
        // Razorpay lets the joiner retry inside the sheet they're looking at;
        // a PhonePe failure arrives after they left, so they hear about it.
        await markFailed(payment, provider === "phonepe");
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
// closed tab or a missed webhook still ends in the right state.
export async function pollPendingPayments(): Promise<void> {
  await connectDb();
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
