import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import type { GatewayEvent, PaymentGateway } from "@/server/payments/gateway";
import { callJson } from "@/server/payments/http";
import { fail } from "@/server/respond";

// Razorpay Standard Checkout: the server creates an order, the browser opens
// the modal with it, the HMAC over order|payment proves the result.
const API = "https://api.razorpay.com/v1";

function keys(): { id: string; secret: string } {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
    fail("NOT_CONFIGURED", "Razorpay keys are not configured");
  }
  return { id: config.RAZORPAY_KEY_ID, secret: config.RAZORPAY_KEY_SECRET };
}

async function razorpay<T>(path: string, body?: unknown): Promise<T> {
  const { id, secret } = keys();
  return callJson<T>(
    `${API}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    `Razorpay ${path.split("/")[1]}`,
  );
}

function hmacMatches(secret: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface WebhookBody {
  event: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string } };
    order?: { entity?: { id?: string; receipt?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
  };
}

const KINDS: Record<string, GatewayEvent["kind"]> = {
  "payment.captured": "captured",
  "order.paid": "captured",
  "payment.failed": "failed",
  "refund.processed": "refunded",
};

export const razorpayGateway: PaymentGateway = {
  provider: "razorpay",

  async createOrder({ joinId, merchantOrderId, amountP }) {
    const order = await razorpay<{ id: string }>("/orders", {
      amount: amountP,
      currency: "INR",
      receipt: merchantOrderId,
      notes: { join_id: joinId, merchant_order_id: merchantOrderId },
    });
    return {
      providerOrderId: order.id,
      handoff: { kind: "modal", provider: "razorpay", orderId: order.id, keyId: keys().id, amountP, merchantOrderId },
    };
  },

  resume(payment) {
    return {
      kind: "modal",
      provider: "razorpay",
      orderId: payment.providerOrderId,
      keyId: keys().id,
      amountP: payment.amountP,
      merchantOrderId: payment.merchantOrderId,
    };
  },

  async verifyCheckout(payment, input) {
    if ("razorpay_signature" in input) {
      const payload = `${payment.providerOrderId}|${input.razorpay_payment_id}`;
      if (!hmacMatches(keys().secret, payload, input.razorpay_signature)) {
        fail("PAYMENT_FAILED", "Payment could not be verified");
      }
      return { state: "captured", providerPaymentId: input.razorpay_payment_id };
    }
    // No signature (the joiner came back from a UPI app): ask Razorpay. A
    // failed attempt doesn't fail the order, the joiner may retry in the
    // sheet, so anything short of captured is still pending.
    const { items } = await razorpay<{ items: { id: string; status: string }[] }>(
      `/orders/${payment.providerOrderId}/payments`,
    );
    const paid = items.find((p) => p.status === "captured");
    return paid ? { state: "captured", providerPaymentId: paid.id } : { state: "pending" };
  },

  async refund(payment, amountP) {
    if (!payment.providerPaymentId) throw new Error(`Payment ${payment._id} has no Razorpay payment id`);
    const refund = await razorpay<{ id: string }>(`/payments/${payment.providerPaymentId}/refund`, {
      amount: amountP,
      notes: { join_id: payment.joinId },
    });
    return { providerRefundId: refund.id };
  },

  async parseWebhook(rawBody, headers) {
    const secret = config.RAZORPAY_WEBHOOK_SECRET;
    const signature = headers.get("x-razorpay-signature");
    const eventId = headers.get("x-razorpay-event-id");
    if (!secret || !signature || !eventId || !hmacMatches(secret, rawBody, signature)) {
      // Dropped with a 200, so this line is the only trace of a wrong
      // RAZORPAY_WEBHOOK_SECRET or someone probing the endpoint.
      console.warn("Razorpay webhook rejected", { eventId, configured: Boolean(secret), signed: Boolean(signature) });
      return null;
    }
    const body = JSON.parse(rawBody) as WebhookBody;
    const payment = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;
    return {
      eventId,
      event: body.event,
      kind: KINDS[body.event] ?? "ignored",
      providerOrderId: payment?.order_id ?? body.payload?.order?.entity?.id,
      providerPaymentId: payment?.id ?? refund?.payment_id,
      providerRefundId: refund?.id,
      amountP: refund?.amount,
    };
  },
};
