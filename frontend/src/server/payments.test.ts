import { createHash, createHmac } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

// Gateways are real code talking to a stubbed fetch: Razorpay and PhonePe
// answers are scripted per test, so every money path runs end to end
// against MongoDB without network or keys.
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
const PP_USER = "pp_user";
const PP_PASS = "pp_pass";

// ---------- scripted gateways ----------

const gateway = {
  orders: 0,
  orderBodies: [] as { amount: number }[],
  razorpayPayments: new Map<string, { id: string; status: string }[]>(),
  phonepeStatus: new Map<string, "PENDING" | "COMPLETED" | "FAILED">(),
  refunds: [] as { url: string; body: unknown }[],
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
  if (/\/v1\/payments\/[^/]+\/refund$/.test(url) || url.endsWith("/payments/v2/refund")) {
    gateway.refunds.push({ url, body });
    return reply({ id: `rfnd_${gateway.refunds.length}`, refundId: `PPR${gateway.refunds.length}` });
  }
  if (url.endsWith("/v1/oauth/token")) {
    return reply({ access_token: "pp_token", expires_at: Math.floor(Date.now() / 1000) + 3600 });
  }
  if (url.endsWith("/checkout/v2/pay")) {
    return reply({ orderId: `OMO_${body.merchantOrderId}`, redirectUrl: `https://phonepe.test/pay/${body.merchantOrderId}` });
  }
  const ppStatus = /\/checkout\/v2\/order\/([^/]+)\/status$/.exec(url);
  if (ppStatus) {
    const mo = decodeURIComponent(ppStatus[1]!);
    const state = gateway.phonepeStatus.get(mo) ?? "PENDING";
    return reply({
      orderId: `OMO_${mo}`,
      state,
      amount: 0,
      paymentDetails: state === "COMPLETED" ? [{ transactionId: `T_${mo}`, state: "COMPLETED" }] : [],
    });
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
    PHONEPE_CLIENT_ID: "pp_client",
    PHONEPE_CLIENT_SECRET: "pp_secret",
    PHONEPE_WEBHOOK_USERNAME: PP_USER,
    PHONEPE_WEBHOOK_PASSWORD: PP_PASS,
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

// ---------- PhonePe ----------

function phonepeHeaders(user = PP_USER, pass = PP_PASS): Headers {
  return new Headers({ authorization: createHash("sha256").update(`${user}:${pass}`).digest("hex") });
}

describe("phonepe", () => {
  beforeEach(() => {
    m.config.config.PAYMENT_PROVIDER = "phonepe";
  });

  it("redirects, reports pending while PhonePe decides, then settles", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    expect(handoff.kind).toBe("redirect");
    if (handoff.kind !== "redirect") return;
    expect(handoff.url).toContain(handoff.merchantOrderId);

    const pending = await m.payments.verifyPayment(joiner, { merchantOrderId: handoff.merchantOrderId });
    expect(pending.state).toBe("pending");
    // The hold stretches to 30 minutes from the join while PhonePe decides.
    const held = await joinOf(join.id);
    expect(held!.expiresAt!.getTime() - held!.createdAt.getTime()).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1);

    gateway.phonepeStatus.set(handoff.merchantOrderId, "COMPLETED");
    const done = await m.payments.verifyPayment(joiner, { merchantOrderId: handoff.merchantOrderId });
    expect(done).toEqual({ state: "captured", activityId: plan._id });
    expect((await joinOf(join.id))?.status).toBe("going");
  });

  it("won't verify someone else's order", async () => {
    const plan = await paidPlan();
    const [joiner, stranger] = await Promise.all([user(), user()]);
    const { handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "redirect") throw new Error("expected redirect");
    await expect(
      m.payments.verifyPayment(stranger, { merchantOrderId: handoff.merchantOrderId }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("finishes in the job tick when the joiner never comes back", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "redirect") throw new Error("expected redirect");
    gateway.phonepeStatus.set(handoff.merchantOrderId, "COMPLETED");
    await m.payments.pollPendingPayments();
    expect((await joinOf(join.id))?.status).toBe("going");
  });

  it("releases the spot and tells the joiner when the webhook says failed", async () => {
    const plan = await paidPlan();
    const joiner = await user();
    const { join, handoff } = await m.joins.requestJoin(joiner, plan._id);
    if (handoff.kind !== "redirect") throw new Error("expected redirect");
    const raw = JSON.stringify({
      event: "checkout.order.failed",
      payload: { orderId: `OMO_${handoff.merchantOrderId}`, merchantOrderId: handoff.merchantOrderId, state: "FAILED" },
    });
    const event = await m.payments.parseWebhook("phonepe", raw, phonepeHeaders());
    expect(event?.kind).toBe("failed");
    await m.payments.handleGatewayEvent("phonepe", event!, raw);
    await m.payments.handleGatewayEvent("phonepe", event!, raw); // redelivery

    expect((await joinOf(join.id))?.status).toBe("expired");
    expect((await activityOf(plan._id))?.goingCount).toBe(0);
    const told = await m.models.NotificationModel.countDocuments({ userId: joiner._id, type: "payment_failed" });
    expect(told).toBe(1);
  });

  it("drops a webhook with the wrong credentials", async () => {
    const raw = JSON.stringify({ event: "checkout.order.completed", payload: { orderId: "X", state: "COMPLETED" } });
    expect(await m.payments.parseWebhook("phonepe", raw, phonepeHeaders(PP_USER, "wrong"))).toBeNull();
  });
});
