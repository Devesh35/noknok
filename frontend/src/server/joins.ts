import "server-only";
import { randomCode } from "@/lib/ids";
import type { CheckInResult, Join, JoinResult } from "@/lib/types";
import { canViewActivity, LIVE_STATUSES } from "@/server/access";
import { audit } from "@/server/audit";
import { viewerKey } from "@/server/auth";
import { devSettings, now, nowDate, updateDevSettings } from "@/server/clock";
import { connectDb, withTx } from "@/server/db";
import { rupees, toJoin } from "@/server/dto";
import {
  afterJoinGoing,
  explainNoSpot,
  expirePendingJoin,
  grantSpot,
  isPast,
  isRefundable,
  moneyFor,
  promoteFromWaitlist,
  releaseSpot,
  takeSpot,
  type Money,
} from "@/server/joins.shared";
import {
  ActivityModel,
  InviteOpenModel,
  JoinModel,
  type ActivityDoc,
  type JoinDoc,
  type UserDoc,
} from "@/server/models";
import { notify } from "@/server/notify";
import { createPayment, paymentsAreFake, refundOrDefer, resumePayment } from "@/server/payments";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

const HOLD_MS = 10 * 60 * 1000;
const CHECK_IN_OPENS_MS = 2 * 60 * 60 * 1000;
const JOIN_LIMIT = 20;

function newJoinId(): string {
  return `TK-${randomCode()}`;
}

async function liveActivity(activityId: string): Promise<ActivityDoc> {
  await connectDb();
  const activity = await ActivityModel.findOne({ _id: activityId, deletedAt: { $exists: false } }).lean();
  if (!activity) fail("NOT_FOUND", "This plan no longer exists");
  if (activity.status === "cancelled") fail("CANCELLED", "This plan was cancelled");
  if (isPast(activity)) fail("PAST", "This plan has already happened");
  return activity;
}

async function liveJoin(activityId: string, userId: string): Promise<JoinDoc | null> {
  return JoinModel.findOne({ activityId, userId, status: { $in: LIVE_STATUSES } }).lean();
}

// Who shared the link this viewer opened, if anyone.
async function inviterFor(activityId: string): Promise<string | undefined> {
  const open = await InviteOpenModel.findById(`${await viewerKey()}:${activityId}`).lean();
  return open?.refId;
}

// Inserts a going join for a spot the caller already took, or flips the
// viewer's waitlisted join. Releases the spot if anything fails.
async function recordGoing(
  activity: ActivityDoc,
  me: UserDoc,
  existing: JoinDoc | null,
  money: Money,
): Promise<JoinDoc> {
  try {
    const invitedBy = await inviterFor(activity._id);
    const join = await withTx(async (session) => {
      if (existing) return grantSpot(existing, money, session);
      const [created] = await JoinModel.create(
        [
          {
            _id: newJoinId(),
            activityId: activity._id,
            userId: me._id,
            status: "waitlisted",
            invitedBy,
            createdAt: nowDate(),
          },
        ],
        { session },
      );
      await ActivityModel.updateOne({ _id: activity._id }, { $inc: { waitlistCount: 1 } }, { session });
      return grantSpot(created.toObject(), money, session);
    });
    await afterJoinGoing(activity, me._id);
    return join;
  } catch (error) {
    await releaseSpot(activity._id);
    if (isDuplicateKey(error)) fail("ALREADY_JOINED", "You already have a spot");
    throw error;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

// Takes a spot (free, or paid in fake mode) or holds one pending payment.
export async function requestJoin(me: UserDoc, activityId: string): Promise<JoinResult> {
  const dev = await devSettings();
  rateLimit(`join:${me._id}`, JOIN_LIMIT, 60_000);
  const activity = await liveActivity(activityId);
  if (!(await canViewActivity(me, activity))) fail("NOT_VISIBLE", "This plan is private");

  let existing = await liveJoin(activityId, me._id);
  if (existing?.status === "going") return { join: toJoin(existing), handoff: { kind: "captured" } };
  if (existing?.status === "pending_payment") {
    if (existing.expiresAt && existing.expiresAt.getTime() > Date.now()) {
      const handoff = await resumePayment(existing._id);
      if (handoff) return { join: toJoin(existing), handoff };
    }
    await expirePendingJoin(existing);
    existing = null;
  }

  const money = await moneyFor(activity);
  const paid = money.totalP > 0;
  // Paid to the host's UPI id outside the app: recorded as going right away.
  const fake = paymentsAreFake() || Boolean(activity.upiId);
  if (paid && fake && dev.failNextPayment) {
    await updateDevSettings({ failNextPayment: false });
    fail("PAYMENT_FAILED", "Payment failed");
  }

  const taken = await takeSpot(activityId);
  if (!taken) {
    // Nothing to give, but a waitlisted joiner keeps their place in line.
    if (existing) return { join: toJoin(existing), handoff: { kind: "captured" } };
    await explainNoSpot(activityId);
  }

  if (!paid || fake) {
    const join = await recordGoing(activity, me, existing, money);
    return { join: toJoin(join), handoff: { kind: "captured" } };
  }

  // A real gateway: hold the spot, the client pays, verifyPayment() (or the
  // webhook, or the job tick) settles.
  let join: JoinDoc;
  try {
    const invitedBy = await inviterFor(activity._id);
    join = await withTx(async (session) => {
      const fields = {
        status: "pending_payment" as const,
        ticketP: money.ticketP,
        feeP: money.feeP,
        hostShareP: money.hostShareP,
        expiresAt: new Date(Date.now() + HOLD_MS),
      };
      if (existing) {
        const updated = await JoinModel.findOneAndUpdate(
          { _id: existing._id, status: "waitlisted" },
          { $set: fields },
          { returnDocument: "after", session },
        ).lean();
        if (!updated) fail("CONFLICT", "Join changed, try again");
        await ActivityModel.updateOne({ _id: activity._id }, { $inc: { waitlistCount: -1 } }, { session });
        return updated;
      }
      const [created] = await JoinModel.create(
        [{ _id: newJoinId(), activityId: activity._id, userId: me._id, invitedBy, createdAt: nowDate(), ...fields }],
        { session },
      );
      await audit(me._id, "join.hold", "join", created._id, undefined, session);
      return created.toObject();
    });
  } catch (error) {
    await releaseSpot(activity._id);
    if (isDuplicateKey(error)) fail("ALREADY_JOINED", "You already have a spot");
    throw error;
  }
  try {
    const handoff = await createPayment(join, money.totalP);
    return { join: toJoin(join), handoff };
  } catch (error) {
    await expirePendingJoin(join);
    throw error;
  }
}

export async function joinWaitlist(me: UserDoc, activityId: string): Promise<Join> {
  await devSettings();
  rateLimit(`join:${me._id}`, JOIN_LIMIT, 60_000);
  const activity = await liveActivity(activityId);
  if (!(await canViewActivity(me, activity))) fail("NOT_VISIBLE", "This plan is private");
  const existing = await liveJoin(activityId, me._id);
  if (existing) return toJoin(existing);
  const invitedBy = await inviterFor(activityId);
  const join = await withTx(async (session) => {
    const [created] = await JoinModel.create(
      [{ _id: newJoinId(), activityId, userId: me._id, status: "waitlisted", invitedBy, createdAt: nowDate() }],
      { session },
    );
    await ActivityModel.updateOne({ _id: activityId }, { $inc: { waitlistCount: 1 } }, { session });
    await audit(me._id, "join.waitlist", "join", created._id, { activityId }, session);
    return created.toObject();
  });
  if (activity.waitlistMode === "approval") {
    await notify(
      activity.hostId,
      "waitlist_request",
      `${me.name} wants a spot at ${activity.title}`,
      "They're on the waitlist. Approve them when a spot opens.",
      `/host/${activityId}`,
    );
  }
  return toJoin(join);
}

// Leaves an activity or its waitlist. Returns the amount refunded in paise.
export async function leaveActivity(me: UserDoc, activityId: string): Promise<number> {
  await devSettings();
  await connectDb();
  const activity = await ActivityModel.findById(activityId).lean();
  const join = activity ? await liveJoin(activityId, me._id) : null;
  if (!activity || !join) return 0;
  if (join.checkedInAt) fail("CONFLICT", "You've already checked in to this plan");
  // After it's over a spot can't be given back; leaving then would erase a no-show.
  if (isPast(activity)) fail("PAST", "This plan has already happened");

  const wasGoing = join.status === "going";
  const paid = join.ticketP + join.feeP;
  const refund = wasGoing && isRefundable(activity) ? paid : 0;
  // Two "leave" taps race here: only the one that flips the status gives the
  // spot back and refunds.
  const changed = await withTx(async (session) => {
    const set: Partial<JoinDoc> = { status: "left", refundedP: refund };
    // Without a refund the host keeps their share.
    if (refund > 0 || !wasGoing) set.hostShareP = 0;
    const result = await JoinModel.updateOne({ _id: join._id, status: join.status }, { $set: set }, { session });
    if (!result.modifiedCount) return false;
    const inc = join.status === "waitlisted" ? { waitlistCount: -1 } : { goingCount: -1 };
    await ActivityModel.updateOne({ _id: activityId }, { $inc: inc }, { session });
    await audit(me._id, "join.leave", "join", join._id, { refundedP: refund }, session);
    return true;
  });
  if (!changed) return 0;
  if (refund > 0) {
    await notify(
      me._id,
      "refund",
      `${rupees(refund)} refund on its way`,
      `You left ${activity.title} before the cutoff.`,
      `/party/${activityId}`,
    );
    await refundOrDefer(join, refund);
  }
  if (wasGoing && activity.status === "active") {
    const fresh = await ActivityModel.findById(activityId).select("goingCount").lean();
    await notify(
      activity.hostId,
      "joiner_left",
      `${me.name} left ${activity.title}`,
      `${fresh?.goingCount ?? 0}/${activity.capacity} spots are taken.`,
      `/host/${activityId}`,
    );
  }
  if (join.status !== "waitlisted") await promoteFromWaitlist(activityId);
  return refund;
}

// The host takes someone off an upcoming plan (or a block does it for them):
// their join becomes host_cancelled with a full refund, as if the host had
// cancelled for them. Returns whether anything changed.
export async function removeFromActivity(actorId: string, activity: ActivityDoc, userId: string): Promise<boolean> {
  await connectDb();
  const join = await liveJoin(activity._id, userId);
  if (!join) return false;
  const wasGoing = join.status === "going";
  const refund = wasGoing ? join.ticketP + join.feeP : 0;
  const changed = await withTx(async (session) => {
    const result = await JoinModel.updateOne(
      { _id: join._id, status: join.status },
      { $set: { status: "host_cancelled", refundedP: refund, hostShareP: 0 } },
      { session },
    );
    if (!result.modifiedCount) return false;
    const inc = join.status === "waitlisted" ? { waitlistCount: -1 } : { goingCount: -1 };
    await ActivityModel.updateOne({ _id: activity._id }, { $inc: inc }, { session });
    await audit(actorId, "join.remove", "join", join._id, { refundedP: refund }, session);
    return true;
  });
  if (!changed) return false;
  await notify(
    userId,
    "cancelled",
    `You're no longer going to ${activity.title}`,
    refund > 0 ? `The host removed your spot. ${rupees(refund)} is being refunded.` : "The host removed your spot.",
    `/party/${activity._id}`,
  );
  if (refund > 0) await refundOrDefer(join, refund);
  if (join.status !== "waitlisted") await promoteFromWaitlist(activity._id);
  return true;
}

export async function removeAttendee(me: UserDoc, activityId: string, userId: string): Promise<void> {
  await devSettings();
  const activity = await liveActivity(activityId);
  if (activity.hostId !== me._id) fail("FORBIDDEN", "Not your plan");
  if (!(await removeFromActivity(me._id, activity, userId))) fail("NOT_FOUND", "They aren't on this plan");
}

// Host hands a free spot to someone on the waitlist. False if there's no room.
export async function approveWaitlist(me: UserDoc, joinId: string): Promise<boolean> {
  await devSettings();
  await connectDb();
  const join = await JoinModel.findById(joinId).lean();
  const activity = join ? await ActivityModel.findById(join.activityId).lean() : null;
  if (!join || !activity) fail("NOT_FOUND", "No such request");
  if (activity.hostId !== me._id) fail("FORBIDDEN", "Not your plan");
  if (join.status !== "waitlisted") return false;
  const taken = await takeSpot(activity._id);
  if (!taken) return false;
  const money = await moneyFor(activity);
  try {
    await withTx((session) => grantSpot(join, money, session));
  } catch (error) {
    await releaseSpot(activity._id);
    throw error;
  }
  await notify(
    join.userId,
    "waitlist_promoted",
    "You're off the waitlist!",
    `The host gave you a spot at ${activity.title}.`,
    `/party/${activity._id}`,
  );
  return true;
}

// Host "scans" a ticket by entering its id.
export async function checkIn(me: UserDoc, activityId: string, ticketId: string): Promise<CheckInResult> {
  await devSettings();
  await connectDb();
  const activity = await ActivityModel.findById(activityId).lean();
  if (!activity) fail("NOT_FOUND");
  if (activity.hostId !== me._id) fail("FORBIDDEN", "Not your plan");
  if (now() < activity.startsAt.getTime() - CHECK_IN_OPENS_MS) {
    fail("CONFLICT", "Check-in opens 2 hours before the start");
  }
  if (isPast(activity)) fail("PAST", "This plan has already ended");
  const join = await JoinModel.findOne({
    _id: ticketId.trim().toUpperCase(),
    activityId,
    status: "going",
  }).lean();
  if (!join) return "not_found";
  if (join.checkedInAt) return "already";
  await JoinModel.updateOne({ _id: join._id }, { $set: { checkedInAt: nowDate() } });
  await audit(me._id, "join.checkin", "join", join._id);
  return "ok";
}

// Joins that hold a ticket, newest first (includes ones the host cancelled).
export async function ticketsOf(userId: string): Promise<JoinDoc[]> {
  await connectDb();
  return JoinModel.find({ userId, status: { $in: ["going", "host_cancelled"] } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}

export { expirePendingJoins, promoteFromWaitlist } from "@/server/joins.shared";
