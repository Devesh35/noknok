// Redirect gateways (PhonePe): the browser leaves for the gateway's page and
// comes back to /pay/return?mo=<merchantOrderId>. The return carries no
// signature; the server asks the gateway what happened.
import { RETURN_PARAM } from "@/lib/payments/types";

// Leaves the app for the gateway. Uses assign() so Back returns to the plan.
export function goToGateway(url: string): void {
  window.location.assign(url);
}

// Our order id from the return URL, or null when the link is malformed.
export function merchantOrderIdFrom(params: URLSearchParams): string | null {
  const value = params.get(RETURN_PARAM);
  return value && /^[A-Za-z0-9_-]{1,63}$/.test(value) ? value : null;
}
