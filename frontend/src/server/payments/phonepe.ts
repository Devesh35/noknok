import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { newId } from "@/lib/ids";
import { config } from "@/server/config";
import type { CheckoutOutcome, GatewayEvent, PaymentGateway } from "@/server/payments/gateway";
import { callJson } from "@/server/payments/http";
import { fail } from "@/server/respond";

// PhonePe PG Standard Checkout v2 (PLATFORM_PLAN §5.4). A redirect flow: the
// joiner pays on PhonePe's page and comes back to /pay/return, which carries
// no signature, so the result is always read from the order status API (or
// the webhook). Plain fetch, no SDK.
const HOSTS = {
  test: {
    pg: "https://api-preprod.phonepe.com/apis/pg-sandbox",
    token: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
  },
  // Production serves OAuth from identity-manager, not from the pg base.
  live: {
    pg: "https://api.phonepe.com/apis/pg",
    token: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token",
  },
} as const;
// How long PhonePe keeps the order open, in seconds (their range is 300–3600).
// Longer than our 10-minute hold so a slow UPI approval can still land.
const ORDER_EXPIRY_S = 30 * 60;
const TOKEN_MARGIN_MS = 60_000;

function credentials() {
  const { PHONEPE_CLIENT_ID: id, PHONEPE_CLIENT_SECRET: secret, PHONEPE_CLIENT_VERSION: version } = config;
  if (!id || !secret) fail("NOT_CONFIGURED", "PhonePe is not configured");
  return { id, secret, version };
}

const hosts = () => HOSTS[config.PAYMENT_ENV];

// The OAuth token is shared by every request on this instance until it expires.
let token: { value: string; expiresAtMs: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAtMs - TOKEN_MARGIN_MS > Date.now()) return token.value;
  const { id, secret, version } = credentials();
  const body = await callJson<{ access_token: string; expires_at: number }>(
    hosts().token,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        client_version: version,
        grant_type: "client_credentials",
      }),
    },
    "PhonePe token",
  );
  token = { value: body.access_token, expiresAtMs: body.expires_at * 1000 };
  return token.value;
}

async function phonepe<T>(path: string, body?: unknown): Promise<T> {
  return callJson<T>(
    `${hosts().pg}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `O-Bearer ${await accessToken()}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    `PhonePe ${path.split("/").slice(1, 3).join("/")}`,
  );
}

interface OrderStatus {
  orderId: string;
  state: "PENDING" | "COMPLETED" | "FAILED";
  amount: number;
  paymentDetails?: { transactionId: string; state: string }[];
}

function outcomeOf(status: OrderStatus): CheckoutOutcome {
  if (status.state === "COMPLETED") {
    const paid = status.paymentDetails?.find((p) => p.state === "COMPLETED");
    return { state: "captured", providerPaymentId: paid?.transactionId ?? status.orderId };
  }
  return status.state === "FAILED" ? { state: "failed" } : { state: "pending" };
}

// The dashboard's webhook username and password, hashed: SHA256("user:pass").
function webhookAuthMatches(header: string | null): boolean {
  const { PHONEPE_WEBHOOK_USERNAME: user, PHONEPE_WEBHOOK_PASSWORD: pass } = config;
  if (!user || !pass || !header) return false;
  const expected = Buffer.from(createHash("sha256").update(`${user}:${pass}`).digest("hex"));
  const given = Buffer.from(header.trim().replace(/^SHA256\s+/i, "").toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface WebhookBody {
  event: string;
  payload?: {
    orderId?: string;
    merchantOrderId?: string;
    originalMerchantOrderId?: string;
    refundId?: string;
    state?: string;
    amount?: number;
    paymentDetails?: { transactionId: string; state: string }[];
  };
}

const KINDS: Record<string, GatewayEvent["kind"]> = {
  "checkout.order.completed": "captured",
  "checkout.order.failed": "failed",
  "pg.refund.completed": "refunded",
};

export const phonepeGateway: PaymentGateway = {
  provider: "phonepe",

  async createOrder({ joinId, merchantOrderId, amountP, returnUrl }) {
    const order = await phonepe<{ orderId: string; redirectUrl: string }>("/checkout/v2/pay", {
      merchantOrderId,
      amount: amountP,
      expireAfter: ORDER_EXPIRY_S,
      metaInfo: { udf1: joinId },
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "NokNok ticket",
        merchantUrls: { redirectUrl: returnUrl },
      },
    });
    return {
      providerOrderId: order.orderId,
      redirectUrl: order.redirectUrl,
      handoff: { kind: "redirect", provider: "phonepe", url: order.redirectUrl, merchantOrderId },
    };
  },

  resume(payment) {
    if (!payment.redirectUrl) fail("CONFLICT", "This payment can't be resumed, try again");
    return { kind: "redirect", provider: "phonepe", url: payment.redirectUrl, merchantOrderId: payment.merchantOrderId };
  },

  async verifyCheckout(payment) {
    const status = await phonepe<OrderStatus>(`/checkout/v2/order/${encodeURIComponent(payment.merchantOrderId)}/status`);
    return outcomeOf(status);
  },

  async refund(payment, amountP) {
    const refund = await phonepe<{ refundId: string }>("/payments/v2/refund", {
      merchantRefundId: newId("rf"),
      originalMerchantOrderId: payment.merchantOrderId,
      amount: amountP,
    });
    return { providerRefundId: refund.refundId };
  },

  async parseWebhook(rawBody, headers) {
    if (!webhookAuthMatches(headers.get("authorization"))) return null;
    const body = JSON.parse(rawBody) as WebhookBody;
    const p = body.payload ?? {};
    const kind = KINDS[body.event] ?? "ignored";
    const paid = p.paymentDetails?.find((d) => d.state === "COMPLETED");
    return {
      // PhonePe sends no event id; an order (or refund) reaches each state once.
      eventId: `${p.refundId ?? p.orderId ?? "unknown"}:${p.state ?? body.event}`,
      event: body.event,
      kind,
      merchantOrderId: p.merchantOrderId ?? p.originalMerchantOrderId,
      providerOrderId: p.orderId,
      providerPaymentId: paid?.transactionId,
      providerRefundId: p.refundId,
      amountP: p.amount,
    };
  },
};
