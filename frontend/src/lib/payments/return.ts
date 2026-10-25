// UPI app switches in the mobile shell bring the joiner back to
// /pay/return?mo=<merchantOrderId>. The return carries no signature; the
// server asks Razorpay what happened.
import { RETURN_PARAM } from "@/lib/payments/types";

// Our order id from the return URL, or null when the link is malformed.
export function merchantOrderIdFrom(params: URLSearchParams): string | null {
  const value = params.get(RETURN_PARAM);
  return value && /^[A-Za-z0-9_-]{1,63}$/.test(value) ? value : null;
}
