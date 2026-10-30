import "server-only";
import { newId } from "@/lib/ids";
import {
  HANDLE_PATTERN,
  type ProfilePatch,
  type RegisterInput,
  type SettingsPatch,
} from "@/lib/schemas";
import { HOUR_MS } from "@/lib/time";
import type {
  Me,
  PersonResult,
  SessionDto,
  User,
  UserStats,
} from "@/lib/types";
import { ApiError } from "@/lib/errors";
import { friendIds, mutualFriendIds } from "@/lib/visibility";
import { LIVE_STATUSES } from "@/server/access";
import { cancelActivityAs } from "@/server/activities";
import { audit } from "@/server/audit";
import { endAllSessions, existingAnonKey, startSession } from "@/server/auth";
import { readSignupToken } from "@/server/auth.signup";
import { devSettings, now } from "@/server/clock";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { deleteFirebaseUser } from "@/server/firebase";
import { toFriendRequest, toMe, toUser } from "@/server/dto";
import { graphFor, removeFriendship } from "@/server/friends";
import { leaveActivity, removeFromActivity } from "@/server/joins";
import {
  ActivityModel,
  FriendRequestModel,
  InviteOpenModel,
  JoinModel,
  ReviewModel,
  UserModel,
  type ActivityDoc,
  type UserDoc,
} from "@/server/models";
import { unreadCount } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

const SEARCH_LIMIT = 6;
// "me" is a route; the rest would let someone pass as staff.
const RESERVED_HANDLES = [
  "me",
  "admin",
  "administrator",
  "root",
  "noknok",
  "support",
  "help",
  "staff",
  "team",
  "official",
  "moderator",
  "mod",
  "security",
  "system",
  "api",
  "dev",
  "settings",
  "host",
];
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
    upi: config.PAYMENT_PROVIDER === "upi" ? { id: config.UPI_ID, name: config.UPI_PAYEE_NAME } : null,
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

// Also true for a handle that isn't valid, so it never reads as available.
export async function isHandleTaken(
  handle: string,
  exceptUserId?: string,
): Promise<boolean> {
  if (!HANDLE_PATTERN.test(handle) || RESERVED_HANDLES.includes(handle))
    return true;
  await connectDb();
  const other = await UserModel.exists({
    handle,
    _id: { $ne: exceptUserId ?? "" },
  });
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
        $setOnInsert: {
          _id: id,
          viewerKey: userId,
          activityId: open.activityId,
        },
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

  // 3-17 characters, so the two-digit suffix still fits the 20-character limit.
  const base = (input.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "user")
    .slice(0, 17)
    .padEnd(3, "0");
  let handle = base;
  while (await isHandleTaken(handle))
    handle = `${base}${Math.floor(10 + Math.random() * 90)}`;

  const created = await UserModel.create({
    _id: newId("u"),
    handle,
    name: input.name,
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

export async function updateProfile(
  me: UserDoc,
  patch: ProfilePatch,
): Promise<Me> {
  await connectDb();
  if (patch.handle !== undefined && patch.handle !== me.handle) {
    if (await isHandleTaken(patch.handle, me._id))
      fail("HANDLE_TAKEN", "That handle is taken");
  }
  // A null photo means "back to initials": drop the field rather than store null.
  const { avatarUrl, ...rest } = patch;
  const update = {
    $set: avatarUrl === null ? rest : patch,
    ...(avatarUrl === null ? { $unset: { avatarUrl: "" } } : {}),
  };
  const doc = await UserModel.findByIdAndUpdate(me._id, update, {
    returnDocument: "after",
  }).lean();
  if (!doc) fail("NOT_FOUND");
  await audit(me._id, "user.update", "user", me._id, Object.keys(patch));
  return toMe(doc);
}

export async function updateSettings(
  me: UserDoc,
  patch: SettingsPatch,
): Promise<Me> {
  await connectDb();
  const set = Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [`settings.${k}`, v]),
  );
  const doc = await UserModel.findByIdAndUpdate(
    me._id,
    { $set: set },
    { returnDocument: "after" },
  ).lean();
  if (!doc) fail("NOT_FOUND");
  return toMe(doc);
}

// Returns whether the user is now blocked. Blocking also unfriends and takes
// them off my upcoming plans (refunded in full), so they can't stay in.
export async function toggleBlock(
  me: UserDoc,
  userId: string,
): Promise<boolean> {
  await devSettings();
  await connectDb();
  const blocked = me.blockedIds.includes(userId);
  await UserModel.updateOne(
    { _id: me._id },
    blocked
      ? { $pull: { blockedIds: userId } }
      : { $addToSet: { blockedIds: userId } },
  );
  await audit(me._id, blocked ? "user.unblock" : "user.block", "user", userId);
  if (!blocked) {
    await removeFriendship(me, userId);
    const mine = await upcomingHostedBy(me._id);
    for (const activity of mine)
      await removeFromActivity(me._id, activity, userId);
  }
  return !blocked;
}

async function upcomingHostedBy(userId: string): Promise<ActivityDoc[]> {
  return ActivityModel.find({
    hostId: userId,
    status: "active",
    endsAt: { $gt: new Date(now()) },
    ...live,
  }).lean();
}

export async function blockedUsers(me: UserDoc): Promise<User[]> {
  await connectDb();
  const docs = await UserModel.find({
    _id: { $in: me.blockedIds },
    ...live,
  }).lean();
  return docs.map(toUser);
}

// Soft delete: the row stays for joins and reviews to point at; the phone and
// handle are freed so the person can sign up again, here and in Firebase.
// Their upcoming plans are cancelled (everyone refunded) and their own spots
// given up first, so nobody is left holding a ticket to a plan that vanished.
export async function deleteAccount(me: UserDoc): Promise<void> {
  await devSettings();
  await connectDb();
  for (const activity of await upcomingHostedBy(me._id))
    await cancelActivityAs(me._id, activity);
  const joins = await JoinModel.find({
    userId: me._id,
    status: { $in: [...LIVE_STATUSES] },
  })
    .select("activityId")
    .lean();
  for (const join of joins) {
    try {
      await leaveActivity(me, join.activityId);
    } catch (error) {
      // Checked in to something happening now: that spot was used, keep it.
      if (!(error instanceof ApiError)) throw error;
    }
  }
  await UserModel.updateOne(
    { _id: me._id },
    {
      $set: {
        deletedAt: new Date(),
        phone: `${me.phone}#${Date.now()}`,
        handle: me._id.toLowerCase(),
      },
    },
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
    JoinModel.find({ userId, status: "going" })
      .select("activityId checkedInAt")
      .lean(),
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

export async function searchPeople(
  q: string,
  viewer: UserDoc | null,
): Promise<PersonResult[]> {
  const needle = q.trim();
  if (!needle) return [];
  await connectDb();
  const pattern = new RegExp(escapeRegex(needle), "i");
  const exclude = [viewer?._id, ...(viewer?.blockedIds ?? [])].filter(
    (id): id is string => !!id,
  );
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
  const mine = viewer
    ? new Set(friendIds(graph, viewer._id))
    : new Set<string>();
  return docs.map((doc) => {
    const request = pending.find(
      (r) => r.fromId === doc._id || r.toId === doc._id,
    );
    return {
      user: toUser(doc),
      isFriend: mine.has(doc._id),
      mutualCount: viewer
        ? mutualFriendIds(graph, viewer._id, doc._id).length
        : 0,
      request: request ? toFriendRequest(request) : null,
    };
  });
}
