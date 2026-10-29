import "server-only";
import { newId, randomCode } from "@/lib/ids";
import type { ActivityInput, QuickPlanInput } from "@/lib/schemas";
import { HOUR_MS } from "@/lib/time";
import type { Activity } from "@/lib/types";
import { audit } from "@/server/audit";
import { viewerKey } from "@/server/auth";
import { devSettings, now, nowDate } from "@/server/clock";
import { connectDb, withTx } from "@/server/db";
import { toActivity } from "@/server/dto";
import { cancelJoinsFor, isPast, notifyCancelled, promoteFromWaitlist } from "@/server/joins.shared";
import {
  ActivityModel,
  InterestedModel,
  InviteOpenModel,
  JoinModel,
  ReportModel,
  ReviewModel,
  UserModel,
  type ActivityDoc,
  type UserDoc,
} from "@/server/models";
import { notify } from "@/server/notify";
import { refundOrDefer } from "@/server/payments";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

const QUICK_PLAN_HOURS = 2;
const SHORT_CODE_TRIES = 5;
const MAX_AHEAD_MS = 365 * 24 * HOUR_MS;

// A new start time must be in the future and within a year.
function checkStart(startsAt: string): void {
  const at = Date.parse(startsAt);
  if (at <= now()) fail("PAST", "Pick a time that hasn't passed yet");
  if (at > now() + MAX_AHEAD_MS) fail("INVALID", "Pick a date within the next year");
}

export async function activityById(id: string): Promise<ActivityDoc | null> {
  await connectDb();
  return ActivityModel.findOne({ _id: id, deletedAt: { $exists: false } }).lean();
}

async function ownActivity(me: UserDoc, id: string): Promise<ActivityDoc> {
  const activity = await activityById(id);
  if (!activity) fail("NOT_FOUND", "This plan no longer exists");
  if (activity.hostId !== me._id) fail("FORBIDDEN", "Not your plan");
  return activity;
}

// For pages: a missing plan or short link answers with a real 404.
export async function activityExists(id: string): Promise<boolean> {
  return (await activityById(id)) !== null;
}

export async function shortCodeExists(code: string): Promise<boolean> {
  await connectDb();
  return (await ActivityModel.exists({ shortCode: code.toUpperCase() })) !== null;
}

export async function activityByCode(code: string): Promise<string> {
  await connectDb();
  const doc = await ActivityModel.findOne({ shortCode: code.toUpperCase() }).select("_id").lean();
  if (!doc) fail("NOT_FOUND", "No plan with that code");
  return doc._id;
}

export interface ActivityPreview {
  title: string;
  description: string;
  coverUrl?: string;
  isPrivate: boolean;
}

// For link previews: private plans get generic metadata.
export async function getActivityPreview(id: string): Promise<ActivityPreview | null> {
  const activity = await activityById(id);
  if (!activity) return null;
  return {
    title: activity.title,
    description: `${activity.venueName}, ${activity.city}. ${activity.description}`,
    coverUrl: activity.coverUrl,
    isPrivate: activity.visibility !== "open",
  };
}

// For now the only way to collect money is straight to the host's UPI id.
function requireUpiForPaid(input: ActivityInput): void {
  if (input.priceP > 0 && !input.upiId) fail("INVALID", "Add the UPI id joiners should pay");
}

function fieldsFrom(input: ActivityInput) {
  const { lat, lng, startsAt, endsAt, upiId, ...rest } = input;
  return {
    ...rest,
    // Free plans collect nothing, so they keep no UPI id.
    upiId: input.priceP > 0 ? upiId : undefined,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    location:
      lat !== undefined && lng !== undefined
        ? { type: "Point" as const, coordinates: [lng, lat] as [number, number] }
        : undefined,
  };
}

export async function createActivity(me: UserDoc, input: ActivityInput, quick = false): Promise<Activity> {
  await devSettings();
  requireUpiForPaid(input);
  checkStart(input.startsAt);
  await connectDb();
  // Short codes are six characters; a collision is rare but possible.
  for (let attempt = 0; attempt < SHORT_CODE_TRIES; attempt++) {
    try {
      const created = await ActivityModel.create({
        _id: newId("a"),
        hostId: me._id,
        ...fieldsFrom(input),
        status: "active",
        inviteToken: randomCode(10).toLowerCase(),
        shortCode: randomCode(),
        quick,
        createdAt: nowDate(),
      });
      const doc = created.toObject();
      await audit(me._id, "activity.create", "activity", doc._id);
      return toActivity(doc, { includeInviteToken: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  fail("CONFLICT", "Could not assign a short code, try again");
}

export async function updateActivity(me: UserDoc, id: string, input: ActivityInput): Promise<Activity> {
  await devSettings();
  requireUpiForPaid(input);
  const before = await ownActivity(me, id);
  if (before.status === "cancelled") fail("CANCELLED", "This plan was cancelled");
  if (isPast(before)) fail("PAST", "This plan has already happened");
  const timeChanged = Date.parse(input.startsAt) !== before.startsAt.getTime();
  if (timeChanged) checkStart(input.startsAt);
  if (input.capacity < before.goingCount) {
    fail("CONFLICT", `${before.goingCount} people have already joined, so it can't be lower`);
  }
  // People paid (or joined free) at the old price.
  const holders = await JoinModel.countDocuments({ activityId: id, status: { $in: ["going", "pending_payment"] } });
  if (holders > 0 && input.priceP !== before.priceP) {
    fail("CONFLICT", "People have already joined, so the price can't change");
  }

  const { location, upiId, ...fields } = fieldsFrom(input);
  const unset = { ...(location ? {} : { location: 1 }), ...(upiId ? {} : { upiId: 1 }) };
  const doc = await ActivityModel.findByIdAndUpdate(
    id,
    {
      $set: { ...fields, ...(location ? { location } : {}), ...(upiId ? { upiId } : {}) },
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { returnDocument: "after" },
  ).lean();
  if (!doc) fail("NOT_FOUND");
  await audit(me._id, "activity.update", "activity", id);
  const placeChanged = input.venueName !== before.venueName || input.address !== before.address;
  if (timeChanged || placeChanged) await notifyPlanChanged(doc, timeChanged, placeChanged);
  await promoteFromWaitlist(id); // capacity may have grown
  return toActivity(doc, { includeInviteToken: true });
}

// Everyone holding a spot or waiting for one hears about a new time or place.
async function notifyPlanChanged(activity: ActivityDoc, time: boolean, place: boolean): Promise<void> {
  const joins = await JoinModel.find({
    activityId: activity._id,
    status: { $in: ["going", "pending_payment", "waitlisted"] },
  })
    .select("userId")
    .lean();
  const what = time && place ? "time and place" : time ? "time" : "place";
  for (const join of joins) {
    await notify(
      join.userId,
      "plan_updated",
      `${activity.title}: new ${what}`,
      "The host changed the details. Check the plan and leave if it no longer works for you.",
      `/party/${activity._id}`,
    );
  }
}

// Cancels the activity and refunds everyone in full.
export async function cancelActivity(me: UserDoc, id: string): Promise<void> {
  await devSettings();
  const activity = await ownActivity(me, id);
  await cancelActivityAs(me._id, activity);
}

// Also used when the host deletes their account.
export async function cancelActivityAs(actorId: string, activity: ActivityDoc): Promise<void> {
  if (activity.status === "cancelled") return;
  const id = activity._id;
  const joins = await withTx(async (session) => {
    await ActivityModel.updateOne({ _id: id }, { $set: { status: "cancelled" } }, { session });
    const changed = await cancelJoinsFor(activity, session);
    await audit(actorId, "activity.cancel", "activity", id, { joins: changed.length }, session);
    return changed;
  });
  await notifyCancelled(activity, joins);
  // Everyone has been told; one gateway fault must not skip the others.
  for (const join of joins) {
    if (join.status === "going" && join.ticketP + join.feeP > 0) {
      await refundOrDefer(join, join.ticketP + join.feeP);
    }
  }
}

// "Quick plan": a free, open activity made from four answers.
export async function createQuickPlan(me: UserDoc, input: QuickPlanInput): Promise<Activity> {
  const plural = input.need === 1 ? "person" : "people";
  return createActivity(
    me,
    {
      title: input.title,
      category: input.category,
      subcategory: input.subcategory,
      description: `Looking for ${input.need} more ${plural} to join. Message the host in person at the venue.`,
      venueName: input.venueName,
      // The venue name is shown on its own line; repeating it here doubled it.
      address: [input.area, input.city].filter(Boolean).join(", "),
      city: input.city,
      area: input.area,
      startsAt: input.startsAt,
      endsAt: new Date(Date.parse(input.startsAt) + QUICK_PLAN_HOURS * HOUR_MS).toISOString(),
      priceP: 0,
      capacity: input.need,
      visibility: "open",
      setting: "outdoor",
      beginnerFriendly: true,
      tags: [],
      waitlistMode: "auto",
      refundCutoffHours: 0,
    },
    true,
  );
}

// Sets or clears interest and returns the new state. The count only moves when
// the row actually changed, so repeats are no-ops.
export async function setInterested(me: UserDoc, activityId: string, interested: boolean): Promise<boolean> {
  const activity = await activityById(activityId);
  if (!activity) fail("NOT_FOUND");
  const id = `${me._id}:${activityId}`;
  if (!interested) {
    const removed = await InterestedModel.deleteOne({ _id: id });
    if (removed.deletedCount) await ActivityModel.updateOne({ _id: activityId }, { $inc: { interestedCount: -1 } });
    return false;
  }
  const added = await InterestedModel.updateOne(
    { _id: id },
    { $setOnInsert: { _id: id, userId: me._id, activityId } },
    { upsert: true },
  );
  if (added.upsertedCount) await ActivityModel.updateOne({ _id: activityId }, { $inc: { interestedCount: 1 } });
  return true;
}

// Records that the viewer opened a link with ?invite= and/or ?ref=.
export async function openInvite(
  viewer: UserDoc | null,
  activityId: string,
  token: string | null,
  refId: string | null,
): Promise<void> {
  const key = await viewerKey();
  rateLimit(`invite:${key}`, 60, 60_000);
  const activity = await activityById(activityId);
  if (!activity) return;
  const grantsAccess = token !== null && token === activity.inviteToken;
  const validRef =
    refId && refId !== viewer?._id && (await UserModel.exists({ _id: refId, deletedAt: { $exists: false } }))
      ? refId
      : undefined;
  if (!grantsAccess && !validRef) return;

  const id = `${key}:${activityId}`;
  const set: Record<string, unknown> = {};
  if (grantsAccess) set.grantsAccess = true;
  await InviteOpenModel.updateOne(
    { _id: id },
    {
      $setOnInsert: { _id: id, viewerKey: key, activityId, ...(validRef ? { refId: validRef } : {}) },
      ...(Object.keys(set).length ? { $set: set } : {}),
    },
    { upsert: true },
  );
  // An existing row keeps the referrer it already has.
  if (validRef) {
    await InviteOpenModel.updateOne({ _id: id, refId: { $exists: false } }, { $set: { refId: validRef } });
  }
}

export async function addReview(
  me: UserDoc,
  activityId: string,
  input: { rating: number; tags: string[] },
): Promise<void> {
  await devSettings();
  const activity = await activityById(activityId);
  if (!activity) fail("NOT_FOUND");
  if (activity.status === "cancelled") fail("CANCELLED", "This plan was cancelled");
  if (!isPast(activity)) fail("CONFLICT", "You can rate it once it's over");
  const join = await JoinModel.findOne({ activityId, userId: me._id, status: "going" }).lean();
  if (!join) fail("FORBIDDEN", "Only people who went can rate it");
  // Once the host checks anyone in, only checked-in people count as having gone.
  const checkedIn = await JoinModel.exists({ activityId, status: "going", checkedInAt: { $exists: true } });
  if (checkedIn && !join.checkedInAt) fail("FORBIDDEN", "Only people who were checked in can rate it");
  if (await ReviewModel.exists({ activityId, userId: me._id })) fail("CONFLICT", "You've already rated this");
  await ReviewModel.create({
    _id: newId("r"),
    activityId,
    hostId: activity.hostId,
    userId: me._id,
    rating: input.rating,
    tags: input.tags,
    createdAt: nowDate(),
  });
  await audit(me._id, "review.create", "activity", activityId, { rating: input.rating });
  await notify(
    activity.hostId,
    "review",
    `${me.name} rated ${activity.title} ${"★".repeat(input.rating)}`,
    input.tags.length > 0 ? input.tags.join(" · ") : "Thanks for hosting!",
    `/u/me`,
  );
}

export async function report(
  me: UserDoc,
  input: { targetType: "activity" | "user"; targetId: string; reason: string },
): Promise<void> {
  rateLimit(`report:${me._id}`, 10, 24 * HOUR_MS);
  await connectDb();
  await ReportModel.create({ _id: newId("rp"), reporterId: me._id, ...input });
  await audit(me._id, "report.create", input.targetType, input.targetId);
}
