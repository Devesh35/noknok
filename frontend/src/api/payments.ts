"use client";

import { joinActivity, updateDev } from "@/api/actions";
import { getDb } from "@/api/db";
import { activityById, breakdownFor, me } from "@/api/queries";
import { openRazorpayCheckout, PaymentError } from "@/lib/razorpay";
import type { Join } from "@/lib/types";

// NEXT_PUBLIC_PAYMENTS=razorpay_test opens the real Razorpay test checkout;
// anything else simulates a payment.
export const PAYMENT_MODE: "fake" | "razorpay_test" =
  process.env.NEXT_PUBLIC_PAYMENTS === "razorpay_test" ? "razorpay_test" : "fake";

const FAKE_PAYMENT_MS = 1200;
const FREE_JOIN_MS = 400;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Takes payment (if any) and then records the join. Throws PaymentError when
// the payment fails or is dismissed; nothing is recorded in that case.
export async function payAndJoin(activityId: string): Promise<Join> {
  const db = getDb();
  const user = me(db);
  const activity = activityById(db, activityId);
  if (!user || !activity) throw new Error("Cannot join");
  const { total } = breakdownFor(db, activity);

  if (total === 0) {
    await wait(FREE_JOIN_MS);
  } else if (PAYMENT_MODE === "razorpay_test") {
    await openRazorpayCheckout({
      amountInr: total,
      description: activity.title,
      name: user.name,
      phone: user.phone,
      email: user.email,
    });
  } else {
    await wait(FAKE_PAYMENT_MS);
    if (getDb().dev.failNextPayment) {
      updateDev({ failNextPayment: false });
      throw new PaymentError("failed");
    }
  }
  return joinActivity(activityId);
}
