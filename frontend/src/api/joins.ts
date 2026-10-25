"use client";

import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import type { VerifyResult } from "@/lib/payments/types";
import type { CheckInResult, Join, JoinResult } from "@/lib/types";

// Takes a spot (free activities, fake gateway) or holds one and returns the
// gateway handoff. payAndJoin() in src/api/payments.ts drives the whole flow;
// views use that.
export async function requestJoin(activityId: string): Promise<Result<JoinResult>> {
  const result = await safe<JoinResult>(
    apiFetch(`/activities/${activityId}/joins`, { method: "POST" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// After the Razorpay sheet (signed triple) or a redirect back to /pay/return
// (our order id). "pending" means ask again shortly.
export async function verifyPayment(
  input:
    | { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
    | { merchantOrderId: string },
): Promise<Result<VerifyResult>> {
  const result = await safe<VerifyResult>(
    apiFetch("/payments/verify", { method: "POST", body: input }),
  );
  if (result.ok && result.data.state === "captured") await invalidateAll();
  return result;
}

export async function joinWaitlist(activityId: string): Promise<Result<Join>> {
  const result = await safe<Join>(
    apiFetch(`/activities/${activityId}/waitlist`, { method: "POST" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Leaves an activity or its waitlist. Returns the amount refunded in paise.
export async function leaveActivity(activityId: string): Promise<Result<{ refundedP: number }>> {
  const result = await safe<{ refundedP: number }>(
    apiFetch(`/activities/${activityId}/joins`, { method: "DELETE" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Host hands a free spot to someone on the waitlist.
export async function approveWaitlist(joinId: string): Promise<Result<{ approved: boolean }>> {
  const result = await safe<{ approved: boolean }>(
    apiFetch(`/joins/${joinId}/approve`, { method: "POST" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Host takes someone off the plan; they're refunded in full.
export async function removeAttendee(activityId: string, userId: string): Promise<Result<null>> {
  const result = await safe<null>(
    apiFetch(`/activities/${activityId}/attendees/${userId}`, { method: "DELETE" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Host "scans" a ticket by entering its id.
export async function checkIn(
  activityId: string,
  ticketId: string,
): Promise<Result<{ result: CheckInResult }>> {
  const result = await safe<{ result: CheckInResult }>(
    apiFetch(`/activities/${activityId}/check-in`, { method: "POST", body: { ticketId } }),
  );
  if (result.ok) await invalidateAll();
  return result;
}
