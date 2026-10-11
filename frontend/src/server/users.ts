import "server-only";
import { newId } from "@/lib/ids";
import type { ProfilePatch, RegisterInput, SettingsPatch } from "@/lib/schemas";
import { HOUR_MS } from "@/lib/time";
import type { Me, PersonResult, SessionDto, User, UserStats } from "@/lib/types";
import { friendIds, mutualFriendIds } from "@/lib/visibility";
import { audit } from "@/server/audit";
import { endAllSessions, existingAnonKey, startSession } from "@/server/auth";
import { readSignupToken } from "@/server/auth.signup";
import { devSettings, now } from "@/server/clock";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { deleteFirebaseUser } from "@/server/firebase";
import { toFriendRequest, toMe, toUser } from "@/server/dto";
import { graphFor } from "@/server/friends";
import {
  ActivityModel,
  FriendRequestModel,
  InviteOpenModel,
  JoinModel,
  ReviewModel,
  UserModel,
  type UserDoc,
} from "@/server/models";
import { unreadCount } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

const SEARCH_LIMIT = 6;
const RESERVED_HANDLES = ["me"];
const REGISTER_LIMIT = 10;

const live = { deletedAt: { $exists: false } };

export async function getMe(viewer: UserDoc | null): Promise<SessionDto> {
  const dev = await devSettings();
  return {
    user: viewer ? toMe(viewer) : null,
    unread: viewer ? await unreadCount(viewer._id) : 0,
    dev,
    paymentProvider: config.PAYMENT_PROVIDER,
    paymentEnv: config.PAYMENT_ENV,
  };
}

export async function userById(id: string): Promise<UserDoc | null> {
  await connectDb();
  return UserModel.findOne({ _id: id, ...live }).lean();
}

export async function userByHandle(handle: string): Promise<UserDoc | null> {
  await connectDb();
  return UserModel.findOne({ handle: handle.toLowerCase(), ...live }).lean();
}

export async function isHandleTaken(handle: string, exceptUserId?: string): Promise<boolean> {
  if (RESERVED_HANDLES.includes(handle)) return true;
  await connectDb();
  const other = await UserModel.exists({ handle, _id: { $ne: exceptUserId ?? "" } });
  return other !== null;
}

// Invite links opened before logging in now belong to this user.
export async function adoptAnonInvites(userId: string): Promise<void> {
  const anon = await existingAnonKey();
  if (!anon) return;
  await connectDb();
  const opens = await InviteOpenModel.find({ viewerKey: anon }).lean();
  for (const open of opens) {
    const id = `${userId}:${open.activityId}`;
    const set: Record<string, unknown> = {};
    if (open.grantsAccess) set.grantsAccess = true;
    if (open.refId) set.refId = open.refId;
    await InviteOpenModel.updateOne(
      { _id: id },
      {
        $setOnInsert: { _id: id, viewerKey: userId, activityId: open.activityId },
        ...(Object.keys(set).length ? { $set: set } : {}),
      },
      { upsert: true },
    );
  }
  await InviteOpenModel.deleteMany({ viewerKey: anon });
}

// Creates the account for a number Firebase proved (the signup token says
// which) and logs it in.
export async function register(input: RegisterInput, ip: string): Promise<Me> {
  rateLimit(`register:${ip}`, REGISTER_LIMIT, HOUR_MS);
  const { phone, phoneAuthUid } = readSignupToken(input.signupToken);
  await connectDb();
  if (await UserModel.exists({ phone })) {
    fail("CONFLICT", "This number already has an account");
  }

  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "user";
  let handle = base;
  while (await isHandleTaken(handle)) handle = `${base}${Math.floor(10 + Math.random() * 90)}`;

  const created = await UserModel.create({
    _id: newId("u"),
    handle,
    name: input.name,
    city: input.city,
    bio: "New on NokNok 👋",
    phone,
    phoneAuthUid,
    interests: [],
    phoneVerified: true,
    idVerified: false,
  });
  const user = created.toObject();
  await audit(user._id, "user.register", "user", user._id);
  await startSession(user._id);
  await adoptAnonInvites(user._id);
  return toMe(user);
}

export async function updateProfile(me: UserDoc, patch: ProfilePatch): Promise<Me> {
  await connectDb();
  if (patch.handle !== undefined && patch.handle !== me.handle) {
    if (await isHandleTaken(patch.handle, me._id)) fail("HANDLE_TAKEN", "That handle is taken");
  }
  const doc = await UserModel.findByIdAndUpdate(me._id, { $set: patch }, { returnDocument: "after" }).lean();
  if (!doc) fail("NOT_FOUND");
  await audit(me._id, "user.update", "user", me._id, Object.keys(patch));
  return toMe(doc);
}

export async function updateSettings(me: UserDoc, patch: SettingsPatch): Promise<Me> {
  await connectDb();
  const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`settings.${k}`, v]));
  const doc = await UserModel.findByIdAndUpdate(me._id, { $set: set }, { returnDocument: "after" }).lean();
  if (!doc) fail("NOT_FOUND");
  return toMe(doc);
}

// Returns whether the user is now blocked.
export async function toggleBlock(me: UserDoc, userId: string): Promise<boolean> {
  await connectDb();
  const blocked = me.blockedIds.includes(userId);
  await UserModel.updateOne(
    { _id: me._id },
    blocked ? { $pull: { blockedIds: userId } } : { $addToSet: { blockedIds: userId } },
  );
  await audit(me._id, blocked ? "user.unblock" : "user.block", "user", userId);
  return !blocked;
}

export async function blockedUsers(me: UserDoc): Promise<User[]> {
  await connectDb();
  const docs = await UserModel.find({ _id: { $in: me.blockedIds }, ...live }).lean();
  return docs.map(toUser);
}

// Soft delete: the row stays for joins and reviews to point at; the phone is
// freed so the person can sign up again, here and in Firebase.
export async function deleteAccount(me: UserDoc): Promise<void> {
  await connectDb();
  await UserModel.updateOne(
    { _id: me._id },
    { $set: { deletedAt: new Date(), phone: `${me.phone}#${Date.now()}` } },
  );
  await audit(me._id, "user.delete", "user", me._id);
  await endAllSessions(me._id);
  await deleteFirebaseUser(me.phoneAuthUid);
}

export async function userStats(userId: string): Promise<UserStats> {
  await devSettings();
  await connectDb();
  const [reviews, created, joins] = await Promise.all([
    ReviewModel.find({ hostId: userId }).select("rating").lean(),
    ActivityModel.countDocuments({ hostId: userId, ...live }),
    JoinModel.find({ userId, status: "going" }).select("activityId checkedInAt").lean(),
  ]);

  const ratingCount = reviews.length;
  const total = reviews.reduce((s, r) => s + r.rating, 0);
  const rating = ratingCount === 0 ? 0 : total / ratingCount;

  const activityIds = [...new Set(joins.map((j) => j.activityId))];
  const ended = activityIds.length
    ? await ActivityModel.find({
        _id: { $in: activityIds },
        status: "active",
        endsAt: { $lt: new Date(now()) },
      })
        .select("_id")
        .lean()
    : [];
  const endedIds = new Set(ended.map((a) => a._id));
  const past = joins.filter((j) => endedIds.has(j.activityId));
  const joined = past.length;
  const attended = past.filter((j) => j.checkedInAt).length;

  return {
    rating,
    ratingCount,
    hostedCount: created,
    attendance: joined === 0 ? null : Math.round((attended / joined) * 100),
  };
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchPeople(q: string, viewer: UserDoc | null): Promise<PersonResult[]> {
  const needle = q.trim();
  if (!needle) return [];
  await connectDb();
  const pattern = new RegExp(escapeRegex(needle), "i");
  const exclude = [viewer?._id, ...(viewer?.blockedIds ?? [])].filter((id): id is string => !!id);
  const docs = await UserModel.find({
    ...live,
    _id: { $nin: exclude },
    $or: [{ name: pattern }, { handle: pattern }],
  })
    .limit(SEARCH_LIMIT)
    .lean();
  const ids = docs.map((d) => d._id);
  const [graph, pending] = await Promise.all([
    graphFor([viewer?._id, ...ids]),
    viewer
      ? FriendRequestModel.find({
          status: "pending",
          $or: [
            { fromId: viewer._id, toId: { $in: ids } },
            { toId: viewer._id, fromId: { $in: ids } },
          ],
        }).lean()
      : [],
  ]);
  const mine = viewer ? new Set(friendIds(graph, viewer._id)) : new Set<string>();
  return docs.map((doc) => {
    const request = pending.find((r) => r.fromId === doc._id || r.toId === doc._id);
    return {
      user: toUser(doc),
      isFriend: mine.has(doc._id),
      mutualCount: viewer ? mutualFriendIds(graph, viewer._id, doc._id).length : 0,
      request: request ? toFriendRequest(request) : null,
    };
  });
}
