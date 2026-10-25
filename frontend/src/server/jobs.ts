import "server-only";
import { DAY_MS, HOUR_MS } from "@/lib/time";
import { devSettings, now } from "@/server/clock";
import { connectDb } from "@/server/db";
import { expirePendingJoins } from "@/server/joins.shared";
import { ActivityModel, JoinModel, ReviewModel } from "@/server/models";
import { notify } from "@/server/notify";
import { pollPendingPayments } from "@/server/payments";

const REMINDER_WINDOW_MS = DAY_MS;
// Review prompts go out once; plans that ended before this are left alone so
// a clock jump doesn't rake up the whole history.
const REVIEW_LOOKBACK_MS = 30 * DAY_MS;

// What a scheduler calls every few minutes. Every notification is keyed, so
// running it twice is harmless.
export async function tick(): Promise<void> {
  await devSettings();
  await connectDb();
  // Ask the gateways first, so a payment that landed isn't expired.
  await pollPendingPayments();
  await expirePendingJoins();
  const nowMs = now();

  const soon = await ActivityModel.find({
    status: "active",
    deletedAt: { $exists: false },
    startsAt: { $gt: new Date(nowMs), $lte: new Date(nowMs + REMINDER_WINDOW_MS) },
  }).lean();
  if (soon.length) {
    const joins = await JoinModel.find({
      activityId: { $in: soon.map((a) => a._id) },
      status: "going",
    }).lean();
    const byId = new Map(soon.map((a) => [a._id, a]));
    for (const join of joins) {
      const activity = byId.get(join.activityId);
      if (!activity || activity.hostId === join.userId) continue;
      const hours = Math.max(Math.round((activity.startsAt.getTime() - nowMs) / HOUR_MS), 1);
      await notify(
        join.userId,
        "reminder",
        `${activity.title} starts in ${hours} hour${hours === 1 ? "" : "s"}`,
        `${activity.venueName}, ${activity.city}. Have your ticket ready.`,
        `/party/${activity._id}`,
        `reminder:${join._id}`,
      );
    }
    // Hosts hear when a plan starting within a day still has room.
    for (const activity of soon) {
      const left = Math.max(activity.capacity - activity.goingCount, 0);
      if (left === 0) continue;
      await notify(
        activity.hostId,
        "needs_people",
        `${activity.title} needs ${left} more`,
        "Share your invite link to fill the last spots.",
        `/host/${activity._id}`,
        `needs:${activity._id}`,
      );
    }
  }

  const ended = await ActivityModel.find({
    status: "active",
    deletedAt: { $exists: false },
    endsAt: { $lt: new Date(nowMs), $gte: new Date(nowMs - REVIEW_LOOKBACK_MS) },
  }).lean();
  if (ended.length) {
    const ids = ended.map((a) => a._id);
    const [joins, reviews] = await Promise.all([
      JoinModel.find({ activityId: { $in: ids }, status: "going" }).lean(),
      ReviewModel.find({ activityId: { $in: ids } }).select("activityId userId").lean(),
    ]);
    const reviewed = new Set(reviews.map((r) => `${r.userId}:${r.activityId}`));
    // Once a host checked anyone in, only checked-in people may rate
    // (addReview); don't prompt the others into a FORBIDDEN.
    const checkedInAt = new Set(joins.filter((j) => j.checkedInAt).map((j) => j.activityId));
    const byId = new Map(ended.map((a) => [a._id, a]));
    for (const join of joins) {
      const activity = byId.get(join.activityId);
      if (!activity || activity.hostId === join.userId) continue;
      if (reviewed.has(`${join.userId}:${join.activityId}`)) continue;
      if (checkedInAt.has(join.activityId) && !join.checkedInAt) continue;
      await notify(
        join.userId,
        "review",
        `How was ${activity.title}?`,
        "Rate your host to help others pick good plans.",
        `/party/${activity._id}`,
        `review:${join._id}`,
      );
    }
  }
}
