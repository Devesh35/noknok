import "server-only";
import { breakdownForPrice } from "@/lib/fees";
import type { ActivityDetail } from "@/lib/types";
import { friendIds, isFriend, mutualFriendIds } from "@/lib/visibility";
import { accessFor, canView, LIVE_STATUSES } from "@/server/access";
import { activityById } from "@/server/activities";
import { viewerKey } from "@/server/auth";
import { devSettings } from "@/server/clock";
import {
  toActivity,
  toFriendRequest,
  toJoin,
  toReview,
  toUser,
} from "@/server/dto";
import { requestBetween, usersByIds } from "@/server/friends";
import { isRefundable } from "@/server/joins.shared";
import {
  InterestedModel,
  InviteOpenModel,
  JoinModel,
  ReviewModel,
  type UserDoc,
} from "@/server/models";
import { fail } from "@/server/respond";
import { userStats } from "@/server/users";

// The viewer's live join, or the one the host cancelled so the refund line
// can show. Never a join they left or let lapse.
async function viewerJoin(activityId: string, userId: string) {
  const joins = await JoinModel.find({
    activityId,
    userId,
    status: { $in: [...LIVE_STATUSES, "host_cancelled"] },
  })
    .sort({ createdAt: -1 })
    .lean();
  return joins.find((j) => j.status !== "host_cancelled") ?? joins[0] ?? null;
}

// The party page. A plan the viewer may not open still comes back, redacted,
// so the page can show the lock and the invite prompt.
export async function activityDetail(
  id: string,
  viewer: UserDoc | null,
): Promise<ActivityDetail> {
  const dev = await devSettings();
  const activity = await activityById(id);
  if (!activity) fail("NOT_FOUND", "This plan no longer exists");
  const viewerId = viewer?._id ?? null;
  const key = await viewerKey();

  const [
    access,
    going,
    myJoin,
    interested,
    invite,
    request,
    review,
    hostStats,
  ] = await Promise.all([
    accessFor(viewer, [activity]),
    JoinModel.find({ activityId: id, status: "going" })
      .sort({ createdAt: 1 })
      .select("userId")
      .lean(),
    viewerId ? viewerJoin(id, viewerId) : null,
    viewerId ? InterestedModel.exists({ _id: `${viewerId}:${id}` }) : null,
    InviteOpenModel.findById(`${key}:${id}`).lean(),
    viewerId && viewerId !== activity.hostId
      ? requestBetween(viewerId, activity.hostId)
      : null,
    viewerId
      ? ReviewModel.findOne({ activityId: id, userId: viewerId }).lean()
      : null,
    userStats(activity.hostId),
  ]);

  let waitlistPosition = 0;
  if (myJoin?.status === "waitlisted") {
    const ahead = await JoinModel.countDocuments({
      activityId: id,
      status: "waitlisted",
      createdAt: { $lt: myJoin.createdAt },
    });
    waitlistPosition = ahead + 1;
  }

  const goingIds = going.map((j) => j.userId);
  const goingSet = new Set(goingIds);
  const myFriends = viewerId ? friendIds(access.graph, viewerId) : [];
  // The host has no "mutual friends" with themself.
  const mutualIds =
    viewerId && viewerId !== activity.hostId
      ? mutualFriendIds(access.graph, viewerId, activity.hostId)
      : [];
  const users = await usersByIds([
    activity.hostId,
    ...goingIds,
    ...myFriends,
    ...mutualIds,
    ...(invite?.refId ? [invite.refId] : []),
  ]);
  const inviter = invite?.refId ? users.get(invite.refId) : undefined;
  // A deleted host's cancelled plan still opens, so attendees can read the
  // cancellation and refund notice; their name and profile stay hidden.
  const host = users.get(activity.hostId);
  if (!host && activity.status !== "cancelled")
    fail("NOT_FOUND", "This plan no longer exists");
  const hostUser = host
    ? toUser(host)
    : {
        id: activity.hostId,
        handle: "",
        name: "Former host",
        city: activity.city,
        bio: "",
        interests: [],
        phoneVerified: false,
        idVerified: false,
      };
  const pick = (ids: string[]) =>
    ids
      .map((uid) => users.get(uid))
      .filter((u): u is UserDoc => u !== undefined)
      .map(toUser);

  const canViewIt = canView(access, activity);
  return {
    activity: toActivity(activity, {
      locked: !canViewIt,
      includeInviteToken: viewerId === activity.hostId,
    }),
    host: hostUser,
    hostStats,
    attendees: canViewIt ? pick(goingIds) : [],
    breakdown: breakdownForPrice(activity.priceP, dev.feeModel, dev.feePercent),
    refundable: isRefundable(activity),
    viewer: {
      canView: canViewIt,
      join: myJoin ? toJoin(myJoin) : null,
      waitlistPosition,
      interested: interested !== null,
      friendsGoing: pick(
        myFriends.filter((uid) => uid === activity.hostId || goingSet.has(uid)),
      ),
      mutualWithHost: pick(mutualIds),
      isFriendOfHost: viewerId
        ? isFriend(access.graph, viewerId, activity.hostId)
        : false,
      friendRequest: request ? toFriendRequest(request) : null,
      review: review ? toReview(review) : null,
      invite: invite
        ? {
            grantsAccess: invite.grantsAccess,
            refId: invite.refId,
            inviter: inviter ? toUser(inviter) : undefined,
          }
        : null,
    },
  };
}
