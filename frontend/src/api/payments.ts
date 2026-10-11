"use client";

import { requestJoin, verifyPayment } from "@/api/joins";
import { ApiError } from "@/lib/errors";
import { goToGateway } from "@/lib/payments/phonepe";
import { openRazorpayCheckout, PaymentError } from "@/lib/payments/razorpay";
import type { Join, Me, SessionDto } from "@/lib/types";

export { PaymentError };

const FAKE_PAYMENT_MS = 1200;
const FREE_JOIN_MS = 400;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Joins an activity, taking payment first when it costs money. Resolves with
// the join, or null when the browser is leaving for a redirect gateway (the
// flow finishes on /pay/return). Throws PaymentError when the payment fails
// or is dismissed, and ApiError for anything else (FULL, PAST, NOT_VISIBLE…).
export async function payAndJoin(
  activityId: string,
  session: SessionDto,
  me: Me,
  activityTitle: string,
  priceP: number,
): Promise<Join | null> {
  // The fake gateway settles instantly; the short wait is for the UI to show
  // a processing state, as a real gateway would.
  if (session.paymentProvider === "fake" || priceP === 0) {
    await wait(priceP === 0 ? FREE_JOIN_MS : FAKE_PAYMENT_MS);
  }
  const requested = await requestJoin(activityId);
  if (!requested.ok) {
    if (requested.code === "PAYMENT_FAILED") throw new PaymentError("failed");
    throw new ApiError(requested.code, requested.message);
  }
  const { join, handoff } = requested.data;

  switch (handoff.kind) {
    case "captured":
      return join;
    case "redirect":
      goToGateway(handoff.url);
      return null;
    case "modal": {
      // The spot is held; pay in Razorpay's sheet, then the server checks the signature.
      const response = await openRazorpayCheckout({
        orderId: handoff.orderId,
        keyId: handoff.keyId,
        amountP: handoff.amountP,
        description: activityTitle,
        name: me.name,
        phone: me.phone,
        email: me.email,
        testMode: session.paymentEnv === "test",
      });
      const verified = await verifyPayment(response);
      if (!verified.ok) throw new PaymentError("failed");
      return { ...join, status: "going" };
    }
  }
}
