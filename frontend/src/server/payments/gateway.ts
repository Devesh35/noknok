import "server-only";
import type { Handoff, PaymentProvider } from "@/lib/payments/types";
import { config } from "@/server/config";
import type { PaymentDoc } from "@/server/models";
import { fakeGateway } from "@/server/payments/fake";
import { razorpayGateway } from "@/server/payments/razorpay";

// Everything provider-specific about taking money (PLATFORM_PLAN §5.1).
// src/server/payments.ts holds the provider-agnostic rules (settle, expire,
// late capture, idempotent webhooks) and calls a gateway for the rest. No
// gateway method runs inside a transaction (AGENTS-B rule 14).

export interface OrderInput {
  joinId: string;
  merchantOrderId: string;
  amountP: number;
  returnUrl: string;
}

export interface CreatedOrder {
  providerOrderId: string;
  handoff: Handoff;
}

// What the browser posts to /api/payments/verify: Razorpay's signed triple
// after the modal, or just our order id after a UPI app switch.
export type CheckoutInput =
  | { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
  | { merchantOrderId: string };

export type CheckoutOutcome =
  | { state: "captured"; providerPaymentId: string }
  | { state: "pending" }
  | { state: "failed" };

// A webhook, already authenticated and reduced to what payments.ts acts on.
export interface GatewayEvent {
  eventId: string;
  event: string; // the provider's own name, stored for debugging
  kind: "captured" | "failed" | "refunded" | "ignored";
  merchantOrderId?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  amountP?: number;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createOrder(input: OrderInput): Promise<CreatedOrder>;
  // The handoff for an order that already exists (the joiner came back to pay).
  resume(payment: PaymentDoc): Handoff;
  verifyCheckout(payment: PaymentDoc, input: CheckoutInput): Promise<CheckoutOutcome>;
  refund(payment: PaymentDoc, amountP: number): Promise<{ providerRefundId: string }>;
  // null = not ours (bad signature or credentials): the route answers 200 and drops it.
  parseWebhook(rawBody: string, headers: Headers): Promise<GatewayEvent | null>;
}

const GATEWAYS: Record<PaymentProvider, PaymentGateway> = {
  fake: fakeGateway,
  razorpay: razorpayGateway,
  // Same instant settle as fake; the client shows the UPI pay sheet instead.
  upi: { ...fakeGateway, provider: "upi" },
};

// The gateway new orders go to.
export function selectGateway(): PaymentGateway {
  return GATEWAYS[config.PAYMENT_PROVIDER];
}

// The gateway that took a given payment, whatever new orders use now.
export function gatewayFor(provider: PaymentProvider): PaymentGateway {
  return GATEWAYS[provider];
}
