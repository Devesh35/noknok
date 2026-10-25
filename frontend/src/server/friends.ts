import "server-only";
import { newId } from "@/lib/ids";
import type { FriendRequest, User } from "@/lib/types";
import { buildGraph, friendIds, mutualFriendIds, type FriendGraph } from "@/lib/visibility";
import { audit } from "@/server/audit";
import { devSettings } from "@/server/clock";
import { connectDb } from "@/server/db";
import { toFriendRequest, toUser } from "@/server/dto";
import { FriendRequestModel, UserModel, type FriendRequestDoc, type UserDoc } from "@/server/models";
import { notify } from "@/server/notify";
import { fail } from "@/server/respond";

// Friendships are accepted friend_requests in either direction. The graph is
// built per request from the rows touching the users involved, which is
// enough for canSee(): it needs the viewer's friends and each host's friends.
export async function graphFor(userIds: (string | null | undefined)[]): Promise<FriendGraph> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return buildGraph([]);
  await connectDb();
  const docs = await FriendRequestModel.find({
    status: "accepted",
    $or: [{ fromId: { $in: ids } }, { toId: { $in: ids } }],
  }).lean();
  return buildGraph(docs.map(toFriendRequest));
}

export async function usersByIds(ids: Iterable<string>): Promise<Map<string, UserDoc>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  await connectDb();
  const docs = await UserModel.find({ _id: { $in: unique }, deletedAt: { $exists: false } }).lean();
  return new Map(docs.map((doc) => [doc._id, doc]));
}

export async function friendsOf(userId: string): Promise<User[]> {
  const graph = await graphFor([userId]);
  const users = await usersByIds(friendIds(graph, userId));
  return [...users.values()].map(toUser);
}

export async function mutualFriends(a: string, b: string): Promise<User[]> {
  const graph = await graphFor([a, b]);
  const users = await usersByIds(mutualFriendIds(graph, a, b));
  return [...users.values()].map(toUser);
}

export async function requestBetween(a: string, b: string): Promise<FriendRequestDoc | null> {
  await connectDb();
  return FriendRequestModel.findOne({
    $or: [
      { fromId: a, toId: b },
      { fromId: b, toId: a },
    ],
  }).lean();
}

export async function incomingRequests(userId: string): Promise<FriendRequestDoc[]> {
  await connectDb();
  return FriendRequestModel.find({ toId: userId, status: "pending" }).sort({ createdAt: -1 }).lean();
}

export async function outgoingRequests(userId: string): Promise<FriendRequestDoc[]> {
  await connectDb();
  return FriendRequestModel.find({ fromId: userId, status: "pending" }).sort({ createdAt: -1 }).lean();
}

export async function sendFriendRequest(me: UserDoc, toId: string): Promise<FriendRequest> {
  const dev = await devSettings();
  if (toId === me._id) fail("INVALID", "That's you");
  const target = await UserModel.findOne({ _id: toId, deletedAt: { $exists: false } }).lean();
  // A block either way: answer as if they don't exist.
  if (!target || target.blockedIds.includes(me._id) || me.blockedIds.includes(toId)) {
    fail("NOT_FOUND", "No such person");
  }

  const existing = await requestBetween(me._id, toId);
  if (existing && (existing.status === "accepted" || existing.fromId === me._id)) {
    return toFriendRequest(existing);
  }
  // They already asked us: sending one back is the same as accepting.
  const accept = existing !== null || dev.autoAcceptFriends;

  let doc: FriendRequestDoc | null;
  if (existing) {
    doc = await FriendRequestModel.findByIdAndUpdate(
      existing._id,
      { $set: { status: "accepted" } },
      { returnDocument: "after" },
    ).lean();
  } else {
    const created = await FriendRequestModel.create({
      _id: newId("fr"),
      fromId: me._id,
      toId,
      status: accept ? "accepted" : "pending",
    });
    doc = created.toObject();
  }
  if (!doc) fail("CONFLICT", "Request changed, try again");
  await audit(me._id, accept ? "friend.accept" : "friend.request", "user", toId);
  await notify(
    toId,
    accept ? "friend_accepted" : "friend_request",
    accept ? `You and ${me.name} are now friends` : `${me.name} sent you a friend request`,
    accept
      ? "You can see each other's friends-only plans."
      : "Accept to see each other's friends-only plans.",
    `/u/${me.handle}`,
  );
  return toFriendRequest(doc);
}

export async function acceptFriendRequest(me: UserDoc, requestId: string): Promise<FriendRequest> {
  await connectDb();
  const doc = await FriendRequestModel.findOneAndUpdate(
    { _id: requestId, toId: me._id },
    { $set: { status: "accepted" } },
    { returnDocument: "after" },
  ).lean();
  if (!doc) fail("NOT_FOUND", "No such request");
  await audit(me._id, "friend.accept", "user", doc.fromId);
  await notify(
    doc.fromId,
    "friend_accepted",
    `${me.name} accepted your friend request`,
    "You can see each other's friends-only plans.",
    `/u/${me.handle}`,
  );
  return toFriendRequest(doc);
}

// Declines or withdraws a pending request, or unfriends.
export async function removeFriendship(me: UserDoc, otherId: string): Promise<void> {
  await connectDb();
  await FriendRequestModel.deleteMany({
    $or: [
      { fromId: me._id, toId: otherId },
      { fromId: otherId, toId: me._id },
    ],
  });
  await audit(me._id, "friend.remove", "user", otherId);
}
