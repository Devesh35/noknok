// What crosses the API boundary about a payment. Pure types, shared by the
// server gateways and the browser.

// "upi": no gateway. The joiner pays the host's UPI id from their own UPI app
// (deep link or QR) and the join is recorded as going straight away; the host
// checks the money by hand. A launch-week stopgap.
export type PaymentProvider = "fake" | "razorpay" | "upi";

// Gateways that actually move money and settle later.
export type SettlingProvider = Exclude<PaymentProvider, "fake" | "upi">;

// Who a UPI-mode payment goes to.
export interface UpiPayee {
  id: string; // VPA, e.g. host@okaxis
  name: string;
}
export type PaymentEnv = "test" | "live";

// What the browser needs after POST /activities/:id/joins.
export type Handoff =
  // Nothing to pay, or the fake gateway: the join is already going.
  | { kind: "captured" }
  // Razorpay Checkout opens over the page with this server-created order.
  | { kind: "modal"; provider: "razorpay"; orderId: string; keyId: string; amountP: number; merchantOrderId: string };

// POST /api/payments/verify
export type VerifyResult =
  | { state: "captured"; activityId: string }
  // The gateway hasn't decided yet; poll again. The spot stays held.
  | { state: "pending"; activityId: string };

// The query parameter /pay/return reads the order from.
export const RETURN_PARAM = "mo";
