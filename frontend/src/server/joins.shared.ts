import "server-only";
import type { ClientSession } from "mongoose";
import { breakdownForPrice } from "@/lib/fees";
import { HOUR_MS } from "@/lib/time";
import { canSee, friendIds } from "@/lib/visibility";
import { audit } from "@/server/audit";
import { devSettings, now, nowDate } from "@/server/clock";
import { connectDb, withTx } from "@/server/db";
import { rupees } from "@/server/dto";
import { graphFor } from "@/server/friends";
import {
  ActivityModel,
  InterestedModel,
  JoinModel,
  PaymentModel,
  UserModel,
  type ActivityDoc,
  type JoinDoc,
} from "@/server/models";
import { notify } from "@/server/notify";
import { fail } from "@/server/respond";

export function isPast(activity: Pick<ActivityDoc, "endsAt">): boolean {
  return activity.endsAt.getTime() < now();
}

// A joiner who leaves before the cutoff gets everything back.
export function isRefundable(activity: Pick<ActivityDoc, "startsAt" | "refundCutoffHours">): boolean {
  return now() < activity.startsAt.getTime() - activity.refundCutoffHours * HOUR_MS;
}

export interface Money {
  ticketP: number;
  feeP: number;
  hostShareP: number;
  totalP: number;
}

export async function moneyFor(activity: Pick<ActivityDoc, "priceP">): Promise<Money> {
  const dev = await devSettings();
  const price = breakdownForPrice(activity.priceP, dev.feeModel, dev.feePercent);
  return {
    ticketP: price.ticketP,
    feeP: price.totalP - price.ticketP,
    hostShareP: price.hostReceivesP,
    totalP: price.totalP,
  };
}

// The one place capacity is enforced: a conditional increment that only
// succeeds while there is room (AGENTS-B rule 6). Null means no spot.
export async function takeSpot(activityId: string): Promise<ActivityDoc | null> {
  await connectDb();
  return ActivityModel.findOneAndUpdate(
    {
      _id: activityId,
      status: "active",
      deletedAt: { $exists: false },
      $expr: { $lt: ["$goingCount", "$capacity"] },
    },
    { $inc: { goingCount: 1 } },
    { returnDocument: "after" },
  ).lean();
}

export async function releaseSpot(activityId: string, session?: ClientSession): Promise<void> {
  await ActivityModel.updateOne({ _id: activityId }, { $inc: { goingCount: -1 } }, { session });
}

// Why takeSpot() came back empty.
export async function explainNoSpot(activityId: string): Promise<never> {
  const activity = await ActivityModel.findOne({ _id: activityId, deletedAt: { $exists: false } }).lean();
  if (!activity) fail("NOT_FOUND", "This plan no longer exists");
  if (activity.status === "cancelled") fail("CANCELLED", "This plan was cancelled");
  if (isPast(activity)) fail("PAST", "This plan has already happened");
  fail("FULL", "This plan is full");
}

// Everyone who should hear that someone is going: the joiner, the host, and
// friends who can see the plan. Runs after the transaction committed.
export async function afterJoinGoing(activity: ActivityDoc, userId: string): Promise<void> {
  // Count real tickets: goingCount can briefly include spots that parallel
  // losing attempts took and are about to release.
  const [user, goingCount] = await Promise.all([
    UserModel.findById(userId).lean(),
    JoinModel.countDocuments({ activityId: activity._id, status: "going" }),
  ]);
  if (!user) return;
  await notify(
    userId,
    "joined",
    `You're going to ${activity.title}`,
    "Your ticket is under Profile › Joined.",
    `/party/${activity._id}`,
  );
  await notify(
    activity.hostId,
    "new_joiner",
    `${user.name} joined ${activity.title}`,
    `${goingCount}/${activity.capacity} spots are taken.`,
    `/host/${activity._id}`,
  );
  const graph = await graphFor([userId, activity.hostId]);
  const friends = friendIds(graph, userId);
  const friendGraph = await graphFor([...friends, activity.hostId]);
  for (const friendId of friends) {
    if (friendId === activity.hostId || !canSee(friendId, activity, friendGraph)) continue;
    await notify(
      friendId,
      "friend_joined",
      `${user.name} is going to ${activity.title}`,
      "Tap to see the plan and join them.",
      `/party/${activity._id}`,
    );
  }
}

// Flips a join to going inside a transaction. The caller already holds the
// spot (takeSpot) and, for a waitlisted join, the waitlist count drops.
export async function grantSpot(
  join: Pick<JoinDoc, "_id" | "activityId" | "userId" | "status">,
  money: Money,
  session: ClientSession,
): Promise<JoinDoc> {
  const updated = await JoinModel.findOneAndUpdate(
    { _id: join._id, status: join.status },
    {
      $set: {
        status: "going",
        ticketP: money.ticketP,
        feeP: money.feeP,
        hostShareP: money.hostShareP,
      },
      $unset: { expiresAt: 1 },
    },
    { returnDocument: "after", session },
  ).lean();
  if (!updated) fail("CONFLICT", "Join changed, try again");
  if (join.status === "waitlisted") {
    await ActivityModel.updateOne({ _id: join.activityId }, { $inc: { waitlistCount: -1 } }, { session });
  }
  const removed = await InterestedModel.deleteOne({ _id: `${join.userId}:${join.activityId}` }, { session });
  if (removed.deletedCount) {
    await ActivityModel.updateOne({ _id: join.activityId }, { $inc: { interestedCount: -1 } }, { session });
  }
  await audit(join.userId, "join.going", "join", join._id, { activityId: join.activityId }, session);
  return updated;
}

// Gives free spots to the waitlist, first come first served, one atomic spot
// at a time. In "approval" mode nobody is promoted automatically.
export async function promoteFromWaitlist(activityId: string): Promise<void> {
  await connectDb();
  const activity = await ActivityModel.findById(activityId).lean();
  if (!activity || activity.status !== "active" || activity.waitlistMode !== "auto") return;
  const queue = await JoinModel.find({ activityId, status: "waitlisted" }).sort({ createdAt: 1 }).lean();
  const money = await moneyFor(activity);
  for (const join of queue) {
    const taken = await takeSpot(activityId);
    if (!taken) return;
    try {
      await withTx((session) => grantSpot(join, money, session));
    } catch {
      await releaseSpot(activityId);
      continue;
    }
    await notify(
      join.userId,
      "waitlist_promoted",
      "You're off the waitlist!",
      `A spot opened up at ${activity.title}. Your ticket is ready.`,
      `/party/${activity._id}`,
    );
    const user = await UserModel.findById(join.userId).select("name").lean();
    const goingCount = await JoinModel.countDocuments({ activityId, status: "going" });
    await notify(
      activity.hostId,
      "new_joiner",
      `${user?.name ?? "Someone"} got a spot at ${activity.title}`,
      `From the waitlist. ${goingCount}/${activity.capacity} spots are taken.`,
      `/host/${activity._id}`,
    );
  }
}

// Payment arrived for a held spot: the join becomes a ticket.
export async function settlePendingJoin(join: JoinDoc, paymentId: string, providerPaymentId: string): Promise<JoinDoc> {
  const money = { ticketP: join.ticketP, feeP: join.feeP, hostShareP: join.hostShareP, totalP: 0 };
  const activity = await ActivityModel.findById(join.activityId).lean();
  if (!activity) fail("NOT_FOUND");
  const updated = await withTx(async (session) => {
    await PaymentModel.updateOne(
      { _id: paymentId },
      { $set: { status: "captured", providerPaymentId } },
      { session },
    );
    return grantSpot(join, money, session);
  });
  await afterJoinGoing(activity, join.userId);
  return updated;
}

// The hold lapsed or the payment failed: the spot goes back to the pool.
export async function expirePendingJoin(join: Pick<JoinDoc, "_id" | "activityId" | "userId">): Promise<boolean> {
  const changed = await withTx(async (session) => {
    const result = await JoinModel.updateOne(
      { _id: join._id, status: "pending_payment" },
      { $set: { status: "expired" } },
      { session },
    );
    if (!result.modifiedCount) return false;
    await releaseSpot(join.activityId, session);
    await audit(join.userId, "join.expire", "join", join._id, undefined, session);
    return true;
  });
  if (changed) await promoteFromWaitlist(join.activityId);
  return changed;
}

export async function expirePendingJoins(): Promise<void> {
  await connectDb();
  const stale = await JoinModel.find({ status: "pending_payment", expiresAt: { $lt: nowDate() } })
    .select("_id activityId userId")
    .lean();
  for (const join of stale) await expirePendingJoin(join);
}

// Every live join becomes host_cancelled with a full refund owed. Returns the
// joins that changed so the caller can issue gateway refunds afterwards.
export async function cancelJoinsFor(activity: ActivityDoc, session: ClientSession): Promise<JoinDoc[]> {
  const joins = await JoinModel.find({
    activityId: activity._id,
    status: { $in: ["going", "waitlisted", "pending_payment"] },
  })
    .session(session)
    .lean();
  for (const join of joins) {
    await JoinModel.updateOne(
      { _id: join._id },
      {
        $set: {
          status: "host_cancelled",
          refundedP: join.status === "going" ? join.ticketP + join.feeP : 0,
          hostShareP: 0,
        },
      },
      { session },
    );
  }
  await ActivityModel.updateOne(
    { _id: activity._id },
    { $set: { goingCount: 0, waitlistCount: 0 } },
    { session },
  );
  return joins;
}

export async function notifyCancelled(activity: ActivityDoc, joins: JoinDoc[]): Promise<void> {
  for (const join of joins) {
    const paid = join.status === "going" ? join.ticketP + join.feeP : 0;
    await notify(
      join.userId,
      "cancelled",
      `${activity.title} was cancelled`,
      paid > 0 ? `The host cancelled. ${rupees(paid)} is being refunded.` : "The host cancelled this activity.",
      `/party/${activity._id}`,
    );
  }
}
