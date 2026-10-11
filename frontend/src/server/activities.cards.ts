import "server-only";
import type { ActivityCardItem, User } from "@/lib/types";
import { friendIds } from "@/lib/visibility";
import { accessFor, canView, LIVE_STATUSES } from "@/server/access";
import { connectDb } from "@/server/db";
import { toActivity, toJoin, toUser } from "@/server/dto";
import { usersByIds } from "@/server/friends";
import { InterestedModel, JoinModel, type ActivityDoc, type UserDoc } from "@/server/models";

const FACES = 4;

export interface CardOptions {
  includeInviteToken?: boolean;
}

// Builds list cards for a batch of activities with a fixed number of queries,
// whatever the batch size. Items the viewer may not open come back locked.
export async function cardsFor(
  activities: ActivityDoc[],
  viewer: UserDoc | null,
  options: CardOptions = {},
): Promise<ActivityCardItem[]> {
  if (activities.length === 0) return [];
  await connectDb();
  const ids = activities.map((a) => a._id);
  const viewerId = viewer?._id ?? null;

  const [access, going, myJoins, interested] = await Promise.all([
    accessFor(viewer, activities),
    JoinModel.find({ activityId: { $in: ids }, status: "going" })
      .sort({ createdAt: 1 })
      .select("activityId userId createdAt")
      .lean(),
    viewerId
      ? JoinModel.find({ userId: viewerId, activityId: { $in: ids }, status: { $in: LIVE_STATUSES } }).lean()
      : [],
    viewerId ? InterestedModel.find({ userId: viewerId, activityId: { $in: ids } }).lean() : [],
  ]);

  const goingBy = new Map<string, string[]>();
  for (const join of going) {
    const list = goingBy.get(join.activityId) ?? [];
    list.push(join.userId);
    goingBy.set(join.activityId, list);
  }
  const myJoinBy = new Map(myJoins.map((j) => [j.activityId, j]));
  const interestedIn = new Set(interested.map((i) => i.activityId));
  const myFriends = viewerId ? friendIds(access.graph, viewerId) : [];

  // Position in the queue for the viewer's waitlisted joins only.
  const waitlistedIn = myJoins.filter((j) => j.status === "waitlisted").map((j) => j.activityId);
  const positions = new Map<string, number>();
  if (waitlistedIn.length) {
    const queue = await JoinModel.find({ activityId: { $in: waitlistedIn }, status: "waitlisted" })
      .sort({ createdAt: 1 })
      .select("activityId userId")
      .lean();
    const seen = new Map<string, number>();
    for (const join of queue) {
      const n = (seen.get(join.activityId) ?? 0) + 1;
      seen.set(join.activityId, n);
      if (join.userId === viewerId) positions.set(join.activityId, n);
    }
  }

  const userIds = new Set<string>();
  for (const activity of activities) {
    userIds.add(activity.hostId);
    const goers = goingBy.get(activity._id) ?? [];
    goers.slice(0, FACES).forEach((id) => userIds.add(id));
    const goingSet = new Set(goers);
    myFriends.filter((id) => id === activity.hostId || goingSet.has(id)).forEach((id) => userIds.add(id));
  }
  const users = await usersByIds(userIds);
  const pick = (list: string[]): User[] =>
    list.map((id) => users.get(id)).filter((u): u is UserDoc => u !== undefined).map(toUser);

  return activities.flatMap((activity): ActivityCardItem[] => {
    const host = users.get(activity.hostId);
    if (!host) return [];
    const goers = goingBy.get(activity._id) ?? [];
    const goingSet = new Set(goers);
    const locked = !canView(access, activity);
    const myJoin = myJoinBy.get(activity._id);
    return [
      {
        activity: toActivity(activity, { locked, includeInviteToken: options.includeInviteToken }),
        host: toUser(host),
        attendees: pick(goers.slice(0, FACES)),
        friends: pick(myFriends.filter((id) => id === activity.hostId || goingSet.has(id))),
        locked,
        myJoin: myJoin ? toJoin(myJoin) : null,
        waitlistPosition: positions.get(activity._id) ?? 0,
        interested: interestedIn.has(activity._id),
      },
    ];
  });
}
