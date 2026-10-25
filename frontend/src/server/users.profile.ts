import "server-only";
import type { ActivityCardItem, FriendRequestWithUser, ProfileDto } from "@/lib/types";
import { isFriend } from "@/lib/visibility";
import { cardsFor } from "@/server/activities.cards";
import { earningsOf } from "@/server/activities.host";
import { LIVE_STATUSES } from "@/server/access";
import { devSettings } from "@/server/clock";
import { connectDb } from "@/server/db";
import { toActivity, toFriendRequest, toJoin, toUser } from "@/server/dto";
import {
  friendsOf,
  graphFor,
  incomingRequests,
  mutualFriends,
  outgoingRequests,
  requestBetween,
  usersByIds,
} from "@/server/friends";
import { ticketsOf } from "@/server/joins";
import { isPast } from "@/server/joins.shared";
import {
  ActivityModel,
  InterestedModel,
  JoinModel,
  type ActivityDoc,
  type FriendRequestDoc,
  type UserDoc,
} from "@/server/models";
import { fail } from "@/server/respond";
import { userByHandle, userStats } from "@/server/users";

const PAGE = 50;
const live = { deletedAt: { $exists: false } };

async function requestsWithUsers(requests: FriendRequestDoc[], me: string): Promise<FriendRequestWithUser[]> {
  const users = await usersByIds(requests.map((r) => (r.fromId === me ? r.toId : r.fromId)));
  return requests.flatMap((request) => {
    const other = users.get(request.fromId === me ? request.toId : request.fromId);
    return other ? [{ request: toFriendRequest(request), other: toUser(other) }] : [];
  });
}

function upcomingFirst(a: ActivityCardItem, b: ActivityCardItem) {
  return a.activity.startsAt.localeCompare(b.activity.startsAt);
}

// "me" is the viewer's own profile. Other people's plans are subject to their
// privacy setting and to each activity's own visibility.
export async function profileFor(handle: string, viewer: UserDoc | null): Promise<ProfileDto> {
  await devSettings();
  await connectDb();
  let profile: UserDoc | null;
  if (handle === "me") {
    if (!viewer) fail("NOT_LOGGED_IN", "Log in to see your profile");
    profile = viewer;
  } else {
    profile = await userByHandle(handle);
  }
  // Someone who blocked the viewer is invisible to them.
  if (!profile || (viewer && profile.blockedIds.includes(viewer._id))) fail("NOT_FOUND", "No one by that handle");
  const isOwn = viewer?._id === profile._id;
  const viewerId = viewer?._id ?? null;

  const [stats, friends, mutual, request, graph] = await Promise.all([
    userStats(profile._id),
    friendsOf(profile._id),
    viewerId && !isOwn ? mutualFriends(viewerId, profile._id) : [],
    viewerId && !isOwn ? requestBetween(viewerId, profile._id) : null,
    graphFor([viewerId, profile._id]),
  ]);
  const friend = viewerId ? isFriend(graph, viewerId, profile._id) : false;

  const privacy = profile.settings.joinedVisibility;
  const joinedHidden = !isOwn && (privacy === "nobody" || (privacy === "friends" && !friend));

  const hostFilter = { hostId: profile._id, ...live, ...(isOwn ? {} : { status: "active" as const }) };
  const [hosted, liveJoins] = await Promise.all([
    ActivityModel.find(hostFilter).sort({ startsAt: -1 }).limit(PAGE).lean(),
    joinedHidden
      ? []
      : JoinModel.find({ userId: profile._id, status: { $in: LIVE_STATUSES } }).select("activityId").lean(),
  ]);
  const joinedDocs = liveJoins.length
    ? await ActivityModel.find({
        _id: { $in: liveJoins.map((j) => j.activityId) },
        ...live,
        ...(isOwn ? {} : { status: "active" as const }),
      })
        .sort({ startsAt: -1 })
        .limit(PAGE)
        .lean()
    : [];

  const visible = (card: ActivityCardItem) => isOwn || !card.locked;
  const [hostedCards, joinedCards] = await Promise.all([
    cardsFor(hosted, viewer, { includeInviteToken: isOwn }),
    cardsFor(joinedDocs, viewer),
  ]);
  // Cancelled plans are over too, whatever their date.
  const endedIds = new Set(
    [...hosted, ...joinedDocs].filter((a) => isPast(a) || a.status === "cancelled").map((a) => a._id),
  );
  const upcoming = (cards: ActivityCardItem[]) =>
    cards.filter((c) => visible(c) && !endedIds.has(c.activity.id)).sort(upcomingFirst);
  const past = [...hostedCards, ...joinedCards]
    .filter((c) => visible(c) && endedIds.has(c.activity.id))
    .sort(upcomingFirst)
    .reverse();

  const base: ProfileDto = {
    user: toUser(profile),
    stats,
    isOwn,
    relationship: {
      isFriend: friend,
      request: request ? toFriendRequest(request) : null,
      blocked: viewer?.blockedIds.includes(profile._id) ?? false,
    },
    friends,
    mutual,
    hosting: upcoming(hostedCards),
    joined: upcoming(joinedCards),
    joinedHidden,
    past,
    interested: [],
    tickets: [],
    incomingRequests: [],
    outgoingRequests: [],
    earnings: [],
  };
  if (!isOwn) return base;

  const [interestedRows, tickets, incoming, outgoing, earnings] = await Promise.all([
    InterestedModel.find({ userId: profile._id }).select("activityId").lean(),
    ticketsOf(profile._id),
    incomingRequests(profile._id),
    outgoingRequests(profile._id),
    earningsOf(profile._id),
  ]);
  const interestedDocs = interestedRows.length
    ? await ActivityModel.find({
        _id: { $in: interestedRows.map((i) => i.activityId) },
        status: "active",
        ...live,
      })
        .sort({ startsAt: 1 })
        .limit(PAGE)
        .lean()
    : [];
  const ticketActivities = await ActivityModel.find({ _id: { $in: tickets.map((t) => t.activityId) } }).lean();
  const byId = new Map<string, ActivityDoc>(ticketActivities.map((a) => [a._id, a]));

  return {
    ...base,
    interested: await cardsFor(
      interestedDocs.filter((a) => !isPast(a)),
      viewer,
    ),
    // Same plans as the Joined list: live tickets to upcoming plans. Cancelled
    // ones show their refund on the plan; ended ones are under Past.
    tickets: tickets.flatMap((join) => {
      const activity = byId.get(join.activityId);
      const usable =
        activity && join.status === "going" && activity.status === "active" && !activity.deletedAt && !isPast(activity);
      return usable ? [{ join: toJoin(join), activity: toActivity(activity) }] : [];
    }),
    incomingRequests: await requestsWithUsers(incoming, profile._id),
    outgoingRequests: await requestsWithUsers(outgoing, profile._id),
    earnings,
  };
}
