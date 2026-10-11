// What crosses the API boundary about a payment. Pure types, shared by the
// server gateways and the browser.

export type PaymentProvider = "fake" | "razorpay" | "phonepe";
export type PaymentEnv = "test" | "live";

// What the browser needs after POST /activities/:id/joins.
export type Handoff =
  // Nothing to pay, or the fake gateway: the join is already going.
  | { kind: "captured" }
  // Razorpay Checkout opens over the page with this server-created order.
  | { kind: "modal"; provider: "razorpay"; orderId: string; keyId: string; amountP: number; merchantOrderId: string }
  // The browser leaves for the gateway and comes back to /pay/return?mo=….
  | { kind: "redirect"; provider: "phonepe"; url: string; merchantOrderId: string };

// POST /api/payments/verify
export type VerifyResult =
  | { state: "captured"; activityId: string }
  // The gateway hasn't decided yet; poll again. The spot stays held.
  | { state: "pending"; activityId: string };

// The query parameter /pay/return reads the order from.
export const RETURN_PARAM = "mo";
