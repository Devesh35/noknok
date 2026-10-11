// Razorpay Checkout opened with a server-created order id, so the payment
// can be verified on the server afterwards.

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export class PaymentError extends Error {
  constructor(public reason: "failed" | "dismissed" | "unavailable") {
    super(`Payment ${reason}`);
  }
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number; // paise
  currency: "INR";
  name: string;
  description: string;
  prefill: { name?: string; contact?: string; email?: string };
  theme: { color: string };
  // Inside the Android shell: hand UPI intents to the installed app.
  webview_intent?: boolean;
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

// True inside the Capacitor shell (MOBILE_WEBVIEW_PLAN §4).
function inNativeShell(): boolean {
  return window.Capacitor?.isNativePlatform?.() === true;
}

let scriptLoad: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoad = null;
      reject(new PaymentError("unavailable"));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

export interface CheckoutRequest {
  orderId: string;
  keyId: string;
  amountP: number;
  description: string;
  name: string;
  phone: string;
  email?: string;
  testMode: boolean;
}

// Resolves with what the server needs to verify the payment.
export async function openRazorpayCheckout(request: CheckoutRequest): Promise<RazorpayResponse> {
  await loadCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new PaymentError("unavailable");

  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: request.keyId,
      order_id: request.orderId,
      amount: request.amountP,
      currency: "INR",
      name: request.testMode ? "NokNok (test mode)" : "NokNok",
      description: request.description,
      prefill: { name: request.name, contact: `+91${request.phone}`, email: request.email },
      theme: { color: "#8b5cf6" },
      ...(inNativeShell() ? { webview_intent: true } : {}),
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(new PaymentError("dismissed")) },
    });
    checkout.on("payment.failed", () => reject(new PaymentError("failed")));
    checkout.open();
  });
}
