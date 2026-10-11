import "server-only";
import { PAYOUT_DELAY_DAYS } from "@/lib/fees";
import { DAY_MS } from "@/lib/time";
import type { EarningsRow, HostHubDto, HostManageDto, JoinWithUser, PayoutStage } from "@/lib/types";
import { cardsFor } from "@/server/activities.cards";
import { devSettings, now } from "@/server/clock";
import { connectDb } from "@/server/db";
import { toActivity, toJoin, toUser } from "@/server/dto";
import { usersByIds } from "@/server/friends";
import { isPast } from "@/server/joins.shared";
import { ActivityModel, JoinModel, type ActivityDoc, type JoinDoc, type UserDoc } from "@/server/models";
import { fail } from "@/server/respond";

const PAGE = 50;

// Money is held until the activity ends, then paid out T+2.
async function earningsRows(activities: ActivityDoc[]): Promise<EarningsRow[]> {
  const priced = activities.filter((a) => a.priceP > 0);
  if (priced.length === 0) return [];
  const sums = await JoinModel.aggregate<{ _id: string; tickets: number; amountP: number }>([
    { $match: { activityId: { $in: priced.map((a) => a._id) }, status: "going" } },
    { $group: { _id: "$activityId", tickets: { $sum: 1 }, amountP: { $sum: "$hostShareP" } } },
  ]);
  const byId = new Map(sums.map((s) => [s._id, s]));
  return priced
    .map((activity) => {
      const payoutAt = activity.endsAt.getTime() + PAYOUT_DELAY_DAYS * DAY_MS;
      let stage: PayoutStage;
      if (activity.status === "cancelled") stage = "refunded";
      else if (!isPast(activity)) stage = "held";
      else stage = now() < payoutAt ? "pending" : "paid";
      return {
        activity: toActivity(activity, { includeInviteToken: true }),
        tickets: byId.get(activity._id)?.tickets ?? 0,
        amountP: byId.get(activity._id)?.amountP ?? 0,
        stage,
        payoutAt: new Date(payoutAt).toISOString(),
      };
    })
    .sort((a, b) => b.activity.startsAt.localeCompare(a.activity.startsAt));
}

export async function earningsOf(hostId: string): Promise<EarningsRow[]> {
  await devSettings();
  await connectDb();
  const activities = await ActivityModel.find({ hostId, priceP: { $gt: 0 }, deletedAt: { $exists: false } })
    .sort({ startsAt: -1 })
    .limit(PAGE)
    .lean();
  return earningsRows(activities);
}

export async function hostHub(me: UserDoc): Promise<HostHubDto> {
  await devSettings();
  await connectDb();
  const activities = await ActivityModel.find({ hostId: me._id, deletedAt: { $exists: false } })
    .sort({ startsAt: 1 })
    .limit(PAGE)
    .lean();
  const [cards, earnings] = await Promise.all([
    cardsFor(activities, me, { includeInviteToken: true }),
    earningsRows(activities),
  ]);
  return { activities: cards, earnings };
}

async function withUsers(joins: JoinDoc[]): Promise<JoinWithUser[]> {
  const users = await usersByIds(joins.flatMap((j) => [j.userId, ...(j.invitedBy ? [j.invitedBy] : [])]));
  return joins.flatMap((join) => {
    const user = users.get(join.userId);
    if (!user) return [];
    const inviter = join.invitedBy ? users.get(join.invitedBy) : undefined;
    return [{ join: toJoin(join), user: toUser(user), inviter: inviter ? toUser(inviter) : undefined }];
  });
}

export async function hostManage(me: UserDoc, id: string): Promise<HostManageDto> {
  await devSettings();
  await connectDb();
  const activity = await ActivityModel.findOne({ _id: id, deletedAt: { $exists: false } }).lean();
  if (!activity) fail("NOT_FOUND", "This plan no longer exists");
  if (activity.hostId !== me._id) fail("FORBIDDEN", "Not your plan");
  const [going, waitlist, earnings] = await Promise.all([
    JoinModel.find({ activityId: id, status: "going" }).sort({ createdAt: 1 }).lean(),
    JoinModel.find({ activityId: id, status: "waitlisted" }).sort({ createdAt: 1 }).lean(),
    earningsRows([activity]),
  ]);
  return {
    activity: toActivity(activity, { includeInviteToken: true }),
    going: await withUsers(going),
    waitlist: await withUsers(waitlist),
    earnings: earnings[0] ?? null,
  };
}
