import { createHmac } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The gateway is real code talking to a stubbed fetch: Razorpay answers are
// scripted per test, so every money path runs end to end against MongoDB
// without network or keys.
vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
    }),
    headers: async () => ({ get: () => null }),
  };
});

const RZP_SECRET = "rzp_secret_for_tests";
const RZP_WEBHOOK_SECRET = "rzp_webhook_secret";

// ---------- scripted gateways ----------

const gateway = {
  orders: 0,
  orderBodies: [] as { amount: number }[],
  razorpayPayments: new Map<string, { id: string; status: string }[]>(),
  refunds: [] as { url: string; body: unknown }[],
  // How many upcoming refund calls Razorpay answers with a 5xx.
  failRefunds: 0,
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  if (url.endsWith("api.razorpay.com/v1/orders")) {
    gateway.orderBodies.push(body);
    return reply({ id: `order_${++gateway.orders}` });
  }
  const rzpPayments = /\/v1\/orders\/([^/]+)\/payments$/.exec(url);
  if (rzpPayments) return reply({ items: gateway.razorpayPayments.get(rzpPayments[1]!) ?? [] });
  if (/\/v1\/payments\/[^/]+\/refund$/.test(url)) {
    if (gateway.failRefunds > 0) {
      gateway.failRefunds--;
      return reply({ error: "gateway down" }, 502);
    }
    gateway.refunds.push({ url, body });
    return reply({ id: `rfnd_${gateway.refunds.length}` });
  }
  return reply({ error: `unexpected ${url}` }, 500);
}

// ---------- setup ----------

type Modules = {
  joins: typeof import("@/server/joins");
  payments: typeof import("@/server/payments");
  models: typeof import("@/server/models");
  db: typeof import("@/server/db");
  clock: typeof import("@/server/clock");
  config: typeof import("@/server/config");
};

let replSet: MongoMemoryReplSet;
let m: Modules;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    MONGODB_URI: replSet.getUri("noknok-payments"),
    PAYMENT_PROVIDER: "razorpay",
    PAYMENT_ENV: "test",
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: RZP_SECRET,
    RAZORPAY_WEBHOOK_SECRET: RZP_WEBHOOK_SECRET,
  });
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  m = {
    joins: await import("@/server/joins"),
    payments: await import("@/server/payments"),
    models: await import("@/server/models"),
    db: await import("@/server/db"),
    clock: await import("@/server/clock"),
    config: await import("@/server/config"),
  };
  await m.db.connectDb();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(() => {
  m.config.config.PAYMENT_PROVIDER = "razorpay";
  gateway.failRefunds = 0;
});

let seq = 0;
async function user() {
  seq++;
  const doc = await m.models.UserModel.create({
    _id: `u_pay${seq}`,
    handle: `payer${seq}`,
    name: `Payer ${seq}`,
    city: "Kalyan",
    phone: `98888${String(seq).padStart(5, "0")}`,
  });
  return doc.toObject();
}

async function paidPlan(capacity = 10, priceP = 49_900) {
  const host = await user();
  const start = Date.now() + 3 * 24 * 60 * 60 * 1000;
  const doc = await m.models.ActivityModel.create({
    _id: `a_pay${++seq}`,
    hostId: host._id,
    title: `Paid plan ${seq}`,
    category: "sports",
    venueName: "Turf",
    city: "Kalyan",
    startsAt: new Date(start),
    endsAt: new Date(start + 2 * 60 * 60 * 1000),
    priceP,
    capacity,
    visibility: "open",
    inviteToken: `inv${seq}`,
    shortCode: `PAY${seq}`,
  });
  return doc.toObject();
}

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

function razorpayHeaders(raw: string, eventId: string): Headers {
  return new Headers({ "x-razorpay-signature": sign(RZP_WEBHOOK_SECRET, raw), "x-razorpay-event-id": eventId });
}

async function deliverRazorpay(event: string, eventId: string, entity: Record<string, unknown>) {
  const raw = JSON.stringify({ event, payload: { payment: { entity } } });
  const parsed = await m.payments.parseWebhook("razorpay", raw, razorpayHeaders(raw, eventId));
  expect(parsed).not.toBeNull();
  await m.payments.handleGatewayEvent("razorpay", parsed!, raw);
}

const joinOf = (id: string) => m.models.JoinModel.findById(id).lean();
// A failed refund attempt holds a 10-minute claim; pretend it has lapsed.
const ageRefundClaim = (joinId: string) =>
  m.models.PaymentModel.updateMany(
    { joinId },
    { $set: { refundAttemptAt: new Date(Date.now() - 11 * 60 * 1000) } },
  );
const activityOf = (id: string) => m.models.ActivityModel.findById(id).lean();

// ---------- Razorpay ----------

describe("razorpay", () => {
  it("holds the spot, opens the modal and settles on a valid signature", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    expect(join.status).toBe("pending_payment");
    expect(handoff.kind).toBe("modal");
    if (handoff.kind !== "modal") return;
    // The order is for ticket + fee, in paise.
    expect(gateway.orderBodies.at(-1)?.amount).toBe(join.ticketP + join.feeP);
    expect((await activityOf(plan._id))?.goingCount).toBe(1);

    const verified = await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_ok",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_ok`),
    });
    expect(verified).toEqual({ state: "captured", activityId: plan._id });
    expect((await joinOf(join.id))?.status).toBe("going");
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment).toMatchObject({ provider: "razorpay", status: "captured", providerPaymentId: "pay_ok" });
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
  });

  it("rejects a forged signature and keeps the hold", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await expect(
      m.payments.verifyPayment(joiner, {
        razorpay_order_id: handoff.orderId,
        razorpay_payment_id: "pay_x",
        razorpay_signature: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_FAILED" });
    expect((await joinOf(join.id))?.status).toBe("pending_payment");
  });

  it("returns the same order when the joiner asks again during the hold", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const first = await m.joins.requestJoin(joiner, plan._id);
    const again = await m.joins.requestJoin(joiner, plan._id);
    expect(again.join.id).toBe(first.join.id);
    expect(again.handoff).toEqual(first.handoff);
    expect(await m.models.PaymentModel.countDocuments({ joinId: first.join.id })).toBe(1);
  });

  it("settles from the webhook once, however often it is delivered", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    const entity = { id: "pay_hook", order_id: handoff.orderId };

    await deliverRazorpay("payment.captured", "evt_dup", entity);
    await deliverRazorpay("payment.captured", "evt_dup", entity);
    await deliverRazorpay("order.paid", "evt_dup2", entity);

    expect((await joinOf(join.id))?.status).toBe("going");
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
    expect(await m.models.WebhookEventModel.countDocuments({ _id: "razorpay:evt_dup" })).toBe(1);
    const joined = await m.models.NotificationModel.countDocuments({ userId: joiner._id, type: "joined" });
    expect(joined).toBe(1);
  });

  it("ignores a failure that arrives after the capture (out of order)", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await deliverRazorpay("payment.captured", "evt_ooo_1", { id: "pay_ooo", order_id: handoff.orderId });
    await deliverRazorpay("payment.failed", "evt_ooo_2", { id: "pay_ooo_fail", order_id: handoff.orderId });
    expect((await joinOf(join.id))?.status).toBe("going");
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("captured");
  });

  it("drops a webhook with a bad signature", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: {} });
    const headers = new Headers({ "x-razorpay-signature": "bad", "x-razorpay-event-id": "evt_bad" });
    expect(await m.payments.parseWebhook("razorpay", raw, headers)).toBeNull();
  });

  it("refunds a late capture when the spot is gone", async () => {
    const plan = await paidPlan(1);
    const [late, other] = await Promise.all([user(), user()]);
    const { join, handoff } = await m.joins.requestJoin(late, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    // The hold lapses and someone else takes the only spot.
    await m.models.JoinModel.updateOne({ _id: join.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await m.joins.expirePendingJoins();
    m.config.config.PAYMENT_PROVIDER = "fake";
    await m.joins.requestJoin(other, plan._id);
    m.config.config.PAYMENT_PROVIDER = "razorpay";

    const refundsBefore = gateway.refunds.length;
    await deliverRazorpay("payment.captured", "evt_late", { id: "pay_late", order_id: handoff.orderId });
    expect((await joinOf(join.id))?.status).toBe("expired");
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("refunded");
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
  });

  it("keeps the hold when one attempt fails: the joiner may retry in the sheet", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await deliverRazorpay("payment.failed", "evt_retry_1", { id: "pay_try1", order_id: handoff.orderId });
    expect((await joinOf(join.id))?.status).toBe("pending_payment");
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
    // The retry lands on the held spot, not an expired one.
    await deliverRazorpay("payment.captured", "evt_retry_2", { id: "pay_try2", order_id: handoff.orderId });
    expect((await joinOf(join.id))?.status).toBe("going");
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
  });

  it("refunds a capture for a join the joiner left while paying", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    expect(await m.joins.leaveActivity(joiner, plan._id)).toBe(0);
    expect((await joinOf(join.id))?.status).toBe("left");
    expect((await activityOf(plan._id))?.goingCount).toBe(0);

    const refundsBefore = gateway.refunds.length;
    await deliverRazorpay("payment.captured", "evt_left", { id: "pay_left", order_id: handoff.orderId });
    expect((await joinOf(join.id))?.status).toBe("left");
    expect((await activityOf(plan._id))?.goingCount).toBe(0);
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
    expect(gateway.refunds.at(-1)).toMatchObject({ body: { amount: join.ticketP + join.feeP } });
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment).toMatchObject({ status: "refunded", providerPaymentId: "pay_left" });
  });

  it("handles a redelivered webhook again when the first handling threw", async () => {
    const plan = await paidPlan(1);
    const [late, other] = await Promise.all([user(), user()]);
    const { join, handoff } = await m.joins.requestJoin(late, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.models.JoinModel.updateOne({ _id: join.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await m.joins.expirePendingJoins();
    m.config.config.PAYMENT_PROVIDER = "fake";
    await m.joins.requestJoin(other, plan._id);
    m.config.config.PAYMENT_PROVIDER = "razorpay";

    // Spot gone, so the capture must be refunded; Razorpay's refund API is down.
    gateway.failRefunds = 1;
    const entity = { id: "pay_redeliver", order_id: handoff.orderId };
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity } } });
    const parsed = (await m.payments.parseWebhook("razorpay", raw, razorpayHeaders(raw, "evt_redeliver")))!;
    await expect(m.payments.handleGatewayEvent("razorpay", parsed, raw)).rejects.toThrow(/502/);
    let payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment).toMatchObject({ status: "captured", refundOwedP: payment!.amountP });

    // Razorpay redelivers the same event id: not a no-op this time.
    await ageRefundClaim(join.id);
    const refundsBefore = gateway.refunds.length;
    await m.payments.handleGatewayEvent("razorpay", parsed, raw);
    payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("refunded");
    expect(payment?.refundOwedP).toBeUndefined();
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
    const event = await m.models.WebhookEventModel.findById("razorpay:evt_redeliver").lean();
    expect(event?.processedAt).toBeInstanceOf(Date);
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
  });

  it("settles a late capture once when two deliveries race for the spot", async () => {
    const plan = await paidPlan(3);
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.models.JoinModel.updateOne({ _id: join.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await m.joins.expirePendingJoins();
    expect((await activityOf(plan._id))?.goingCount).toBe(0);

    const entity = { id: "pay_race", order_id: handoff.orderId };
    await Promise.all([
      deliverRazorpay("payment.captured", "evt_race_a", entity),
      deliverRazorpay("order.paid", "evt_race_b", entity),
    ]);
    expect((await joinOf(join.id))?.status).toBe("going");
    expect((await activityOf(plan._id))?.goingCount).toBe(1);
    expect(await m.models.JoinModel.countDocuments({ activityId: plan._id, status: "going" })).toBe(1);
  });

  it("gives the spot back once when leave is tapped twice", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_twice",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_twice`),
    });
    const refundsBefore = gateway.refunds.length;
    const results = await Promise.all([
      m.joins.leaveActivity(joiner, plan._id),
      m.joins.leaveActivity(joiner, plan._id),
    ]);
    expect(results.filter((r) => r > 0)).toHaveLength(1);
    expect((await activityOf(plan._id))?.goingCount).toBe(0);
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
    expect(join.ticketP).toBeGreaterThan(0);
  });

  it("records a refund the gateway refused and pays it on the next tick", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_owed",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_owed`),
    });
    gateway.failRefunds = 1;
    const owed = await m.joins.leaveActivity(joiner, plan._id);
    expect(owed).toBe(join.ticketP + join.feeP);
    expect((await joinOf(join.id))?.status).toBe("left");
    let payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment).toMatchObject({ status: "captured", refundOwedP: owed });

    await ageRefundClaim(join.id);
    const refundsBefore = gateway.refunds.length;
    await m.payments.pollPendingPayments();
    payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("refunded");
    expect(payment?.refundOwedP).toBeUndefined();
    expect(gateway.refunds.at(-1)).toMatchObject({ body: { amount: owed } });
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
  });

  it("pays an owed refund once when two ticks overlap", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_overlap",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_overlap`),
    });
    gateway.failRefunds = 1;
    await m.joins.leaveActivity(joiner, plan._id);
    // The failed attempt's claim is stale; both ticks see the owed refund.
    await ageRefundClaim(join.id);
    const refundsBefore = gateway.refunds.length;
    await Promise.all([m.payments.pollPendingPayments(), m.payments.pollPendingPayments()]);
    expect(gateway.refunds.length).toBe(refundsBefore + 1);
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("refunded");
    expect(payment?.refundAttemptAt).toBeUndefined();
  });

  it("does not retry an owed refund while an attempt is still in flight", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_inflight",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_inflight`),
    });
    gateway.failRefunds = 1;
    await m.joins.leaveActivity(joiner, plan._id); // claimed a moment ago, gateway said 502
    const refundsBefore = gateway.refunds.length;
    await m.payments.pollPendingPayments();
    expect(gateway.refunds.length).toBe(refundsBefore); // claim still fresh: left alone
    expect((await m.models.PaymentModel.findOne({ joinId: join.id }).lean())?.refundOwedP).toBeGreaterThan(0);
  });

  it("refunds the other attendees when one refund fails during a cancellation", async () => {
    const plan = await paidPlan(5);
    const joiners = await Promise.all([user(), user(), user()]);
    for (const [i, joiner] of joiners.entries()) {
      const { handoff } = await m.joins.requestJoin(joiner, plan._id);
      if (handoff.kind !== "modal") throw new Error("expected modal");
      await m.payments.verifyPayment(joiner, {
        razorpay_order_id: handoff.orderId,
        razorpay_payment_id: `pay_cancel_${i}`,
        razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_cancel_${i}`),
      });
    }
    const activities = await import("@/server/activities");
    const host = (await m.models.UserModel.findById(plan.hostId).lean())!;
    gateway.failRefunds = 1;
    const refundsBefore = gateway.refunds.length;
    await activities.cancelActivity(host, plan._id);
    expect(gateway.refunds.length).toBe(refundsBefore + 2);
    const payments = await m.models.PaymentModel.find({ joinId: { $in: (await m.models.JoinModel.find({ activityId: plan._id }).lean()).map((j) => j._id) } }).lean();
    expect(payments.filter((p) => p.status === "refunded")).toHaveLength(2);
    expect(payments.filter((p) => p.status === "captured" && p.refundOwedP)).toHaveLength(1);
    // The tick settles the one that was refused, once its claim has lapsed.
    await m.models.PaymentModel.updateMany(
      { joinId: { $in: payments.map((p) => p.joinId) } },
      { $set: { refundAttemptAt: new Date(Date.now() - 11 * 60 * 1000) } },
    );
    await m.payments.pollPendingPayments();
    expect(gateway.refunds.length).toBe(refundsBefore + 3);
  });

  it("refunds ticket and fee through the gateway when leaving before the cutoff", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "modal") throw new Error("expected modal");
    await m.payments.verifyPayment(joiner, {
      razorpay_order_id: handoff.orderId,
      razorpay_payment_id: "pay_leave",
      razorpay_signature: sign(RZP_SECRET, `${handoff.orderId}|pay_leave`),
    });
    const refunded = await m.joins.leaveActivity(joiner, plan._id);
    expect(refunded).toBe(join.ticketP + join.feeP);
    expect(gateway.refunds.at(-1)).toMatchObject({ body: { amount: refunded } });
    const payment = await m.models.PaymentModel.findOne({ joinId: join.id }).lean();
    expect(payment?.status).toBe("refunded");
    expect((await activityOf(plan._id))?.goingCount).toBe(0);
  });
});
