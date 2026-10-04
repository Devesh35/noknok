// Razorpay Checkout in test mode, opened with an amount only (no server-made
// order_id). Good enough to show the real checkout UI in a demo; payments made
// this way cannot be verified and must not be trusted in production.

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export class PaymentError extends Error {
  constructor(public reason: "failed" | "dismissed" | "unavailable") {
    super(`Payment ${reason}`);
  }
}

interface RazorpayOptions {
  key: string;
  amount: number; // paise
  currency: "INR";
  name: string;
  description: string;
  prefill: { name?: string; contact?: string; email?: string };
  theme: { color: string };
  handler: (response: { razorpay_payment_id: string }) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
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
  amountInr: number;
  description: string;
  name: string;
  phone: string;
  email?: string;
}

// Resolves with the Razorpay payment id.
export async function openRazorpayCheckout(request: CheckoutRequest): Promise<string> {
  const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!key) throw new PaymentError("unavailable");
  await loadCheckout();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new PaymentError("unavailable");

  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key,
      amount: request.amountInr * 100,
      currency: "INR",
      name: "NokNok (test mode)",
      description: request.description,
      prefill: { name: request.name, contact: `+91${request.phone}`, email: request.email },
      theme: { color: "#8b5cf6" },
      handler: (response) => resolve(response.razorpay_payment_id),
      modal: { ondismiss: () => reject(new PaymentError("dismissed")) },
    });
    checkout.on("payment.failed", () => reject(new PaymentError("failed")));
    checkout.open();
  });
}
