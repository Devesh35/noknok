"use client";

// Write-side of the mock backend. Each function is what a POST/PATCH/DELETE
// endpoint will do later; today it edits the localStorage database.
import { getDb, mutate, resetDb } from "@/api/db";
import {
  activeJoin,
  activityById,
  breakdownFor,
  goingJoins,
  inviteFor,
  isHandleTaken,
  isPast,
  isRefundable,
  me,
  requestBetween,
  reviewBy,
  settingsFor,
  spotsLeft,
  userById,
} from "@/api/queries";
import { newId, randomCode } from "@/lib/ids";
import { DAY_MS, HOUR_MS, now } from "@/lib/time";
import {
  ANON,
  type Activity,
  type City,
  type Db,
  type DevSettings,
  type Join,
  type NotificationType,
  type User,
  type UserSettings,
} from "@/lib/types";
import { joinsToPromote } from "@/lib/waitlist";

function nowIso(): string {
  return new Date(now()).toISOString();
}

function requireMe(db: Db): User {
  const user = me(db);
  if (!user) throw new Error("Not logged in");
  return user;
}

function notify(
  draft: Db,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  href: string,
  key?: string,
) {
  draft.notifications.push({
    id: newId("n"),
    userId,
    type,
    title,
    body,
    href,
    createdAt: nowIso(),
    read: false,
    key,
  });
}

// ---------- Session ----------

export function logIn(userId: string) {
  mutate((draft) => {
    draft.meId = userId;
    // Invite links opened before logging in now belong to this user.
    for (const invite of draft.invites) {
      if (invite.viewerKey === ANON) invite.viewerKey = userId;
    }
  });
}

export function logOut() {
  mutate((draft) => {
    draft.meId = null;
  });
}

export interface RegisterInput {
  name: string;
  phone: string;
  city: City;
}

export function registerUser(input: RegisterInput): User {
  const db = getDb();
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "user";
  let handle = base;
  while (isHandleTaken(db, handle)) handle = `${base}${Math.floor(10 + Math.random() * 90)}`;

  const user: User = {
    id: newId("u"),
    handle,
    name: input.name.trim(),
    city: input.city,
    bio: "New on NokNok 👋",
    phone: input.phone,
    interests: [],
    phoneVerified: true,
    idVerified: false,
    baseRating: 0,
    baseRatingCount: 0,
    baseHostedCount: 0,
  };
  mutate((draft) => {
    draft.users.push(user);
  });
  logIn(user.id);
  return user;
}

// "Delete account" in the prototype wipes all local data.
export function deleteAccount() {
  resetDb();
}

// ---------- Profile & settings ----------

export type ProfilePatch = Partial<
  Pick<User, "name" | "handle" | "bio" | "city" | "avatarUrl" | "interests">
>;

export function updateProfile(patch: ProfilePatch) {
  mutate((draft) => {
    Object.assign(requireMe(draft), patch);
  });
}

export function updateSettings(patch: Partial<UserSettings>) {
  mutate((draft) => {
    const user = requireMe(draft);
    draft.userSettings[user.id] = { ...settingsFor(draft, user.id), ...patch };
  });
}

export function toggleBlock(userId: string) {
  const db = getDb();
  const blocked = settingsFor(db, requireMe(db).id).blockedIds;
  updateSettings({
    blockedIds: blocked.includes(userId)
      ? blocked.filter((id) => id !== userId)
      : [...blocked, userId],
  });
}

export function setCity(city: City) {
  mutate((draft) => {
    draft.city = city;
  });
}

// ---------- Hosting ----------

export type ActivityInput = Pick<
  Activity,
  | "title"
  | "category"
  | "description"
  | "coverUrl"
  | "venueName"
  | "address"
  | "city"
  | "startsAt"
  | "endsAt"
  | "priceInr"
  | "capacity"
  | "visibility"
  | "tags"
  | "waitlistMode"
  | "refundCutoffHours"
>;

export function createActivity(input: ActivityInput): Activity {
  return mutate((draft) => {
    const activity: Activity = {
      ...input,
      id: newId("a"),
      hostId: requireMe(draft).id,
      status: "active",
      inviteToken: randomCode(10).toLowerCase(),
      shortCode: randomCode(),
      createdAt: nowIso(),
    };
    draft.activities.push(activity);
    return activity;
  });
}

export function updateActivity(id: string, input: ActivityInput) {
  mutate((draft) => {
    const activity = activityById(draft, id);
    if (!activity || activity.hostId !== draft.meId) throw new Error("Not your activity");
    Object.assign(activity, input);
    promoteFromWaitlist(draft, activity); // capacity may have grown
  });
}

// Cancels the activity and refunds everyone in full.
export function cancelActivity(id: string) {
  mutate((draft) => {
    const activity = activityById(draft, id);
    if (!activity || activity.hostId !== draft.meId) throw new Error("Not your activity");
    activity.status = "cancelled";
    for (const join of draft.joins) {
      if (join.activityId !== id) continue;
      if (join.status !== "going" && join.status !== "waitlisted") continue;
      const paid = join.ticketPaid + join.feePaid;
      join.status = "host_cancelled";
      join.refunded = paid;
      join.hostShare = 0;
      notify(
        draft,
        join.userId,
        "cancelled",
        `${activity.title} was cancelled`,
        paid > 0 ? `The host cancelled. ₹${paid} is being refunded.` : "The host cancelled this activity.",
        `/party/${id}`,
      );
    }
  });
}

// ---------- Joining ----------

function grantSpot(draft: Db, join: Join, activity: Activity) {
  const price = breakdownFor(draft, activity);
  join.status = "going";
  join.ticketPaid = price.ticket;
  join.feePaid = price.total - price.ticket;
  join.hostShare = price.hostReceives;
}

function promoteFromWaitlist(draft: Db, activity: Activity) {
  for (const joinId of joinsToPromote(draft.joins, activity)) {
    const join = draft.joins.find((j) => j.id === joinId)!;
    grantSpot(draft, join, activity);
    notify(
      draft,
      join.userId,
      "waitlist_promoted",
      "You're off the waitlist!",
      `A spot opened up at ${activity.title}. Your ticket is ready.`,
      `/party/${activity.id}`,
    );
  }
}

function newJoin(draft: Db, activity: Activity, userId: string): Join {
  const join: Join = {
    id: `TK-${randomCode()}`,
    activityId: activity.id,
    userId,
    status: "waitlisted",
    createdAt: nowIso(),
    ticketPaid: 0,
    feePaid: 0,
    hostShare: 0,
    refunded: 0,
    invitedBy: inviteFor(draft, activity.id)?.refId,
  };
  draft.joins.push(join);
  return join;
}

// Called once payment has succeeded (or straight away for free activities).
export function joinActivity(activityId: string): Join {
  return mutate((draft) => {
    const user = requireMe(draft);
    const activity = activityById(draft, activityId);
    if (!activity || activity.status !== "active") throw new Error("Activity is not open");
    if (spotsLeft(draft, activity) === 0) throw new Error("Activity is full");
    const existing = activeJoin(draft, activityId, user.id);
    if (existing?.status === "going") return existing;

    const join = existing ?? newJoin(draft, activity, user.id);
    grantSpot(draft, join, activity);
    notify(
      draft,
      user.id,
      "joined",
      `You're going to ${activity.title}`,
      "Your ticket is under Profile › Joined.",
      `/party/${activityId}`,
    );
    notify(
      draft,
      activity.hostId,
      "new_joiner",
      `${user.name} joined ${activity.title}`,
      `${goingJoins(draft, activityId).length}/${activity.capacity} spots are taken.`,
      `/host/${activityId}`,
    );
    return join;
  });
}

export function joinWaitlist(activityId: string): Join {
  return mutate((draft) => {
    const user = requireMe(draft);
    const activity = activityById(draft, activityId);
    if (!activity || activity.status !== "active") throw new Error("Activity is not open");
    const existing = activeJoin(draft, activityId, user.id);
    if (existing) return existing;
    const join = newJoin(draft, activity, user.id);
    if (activity.waitlistMode === "approval") {
      notify(
        draft,
        activity.hostId,
        "waitlist_request",
        `${user.name} wants a spot at ${activity.title}`,
        "They're on the waitlist. Approve them when a spot opens.",
        `/host/${activityId}`,
      );
    }
    return join;
  });
}

// Leaves an activity or its waitlist. Returns the amount refunded.
export function leaveActivity(activityId: string): number {
  return mutate((draft) => {
    const user = requireMe(draft);
    const activity = activityById(draft, activityId);
    const join = activeJoin(draft, activityId, user.id);
    if (!activity || !join) return 0;

    const wasGoing = join.status === "going";
    const paid = join.ticketPaid + join.feePaid;
    const refund = wasGoing && isRefundable(activity) ? paid : 0;
    join.status = "left";
    join.refunded = refund;
    // Without a refund the host keeps their share.
    if (refund > 0 || !wasGoing) join.hostShare = 0;
    if (refund > 0) {
      notify(
        draft,
        user.id,
        "refund",
        `₹${refund} refund on its way`,
        `You left ${activity.title} before the cutoff.`,
        `/party/${activityId}`,
      );
    }
    if (wasGoing) promoteFromWaitlist(draft, activity);
    return refund;
  });
}

// Host hands a free spot to someone on the waitlist. False if there's no room.
export function approveWaitlist(joinId: string): boolean {
  return mutate((draft) => {
    const join = draft.joins.find((j) => j.id === joinId);
    const activity = join && activityById(draft, join.activityId);
    if (!join || !activity || activity.hostId !== draft.meId) return false;
    if (join.status !== "waitlisted" || spotsLeft(draft, activity) === 0) return false;
    grantSpot(draft, join, activity);
    notify(
      draft,
      join.userId,
      "waitlist_promoted",
      "You're off the waitlist!",
      `The host gave you a spot at ${activity.title}.`,
      `/party/${activity.id}`,
    );
    return true;
  });
}

export type CheckInResult = "ok" | "already" | "not_found";

// Host "scans" a ticket by entering its id.
export function checkIn(activityId: string, ticketId: string): CheckInResult {
  return mutate((draft) => {
    const join = draft.joins.find(
      (j) =>
        j.activityId === activityId &&
        j.status === "going" &&
        j.id === ticketId.trim().toUpperCase(),
    );
    if (!join) return "not_found";
    if (join.checkedInAt) return "already";
    join.checkedInAt = nowIso();
    return "ok";
  });
}

// ---------- Invite links ----------

// Records that the current viewer opened a link with ?invite= and/or ?ref=.
export function openInvite(activityId: string, token: string | null, refId: string | null) {
  const db = getDb();
  const activity = activityById(db, activityId);
  if (!activity) return;
  const grantsAccess = token !== null && token === activity.inviteToken;
  const validRef = refId && refId !== db.meId && userById(db, refId) ? refId : undefined;
  if (!grantsAccess && !validRef) return;

  const existing = inviteFor(db, activityId);
  // Nothing new to record.
  if (existing && (existing.grantsAccess || !grantsAccess) && (existing.refId || !validRef)) return;
  mutate((draft) => {
    const viewerKey = draft.meId ?? ANON;
    const invite = draft.invites.find(
      (i) => i.viewerKey === viewerKey && i.activityId === activityId,
    );
    if (invite) {
      invite.grantsAccess ||= grantsAccess;
      invite.refId ??= validRef;
    } else {
      draft.invites.push({ viewerKey, activityId, grantsAccess, refId: validRef });
    }
  });
}

// ---------- Friends ----------

export function sendFriendRequest(toId: string) {
  mutate((draft) => {
    const user = requireMe(draft);
    const target = userById(draft, toId);
    if (!target || toId === user.id) return;

    const existing = requestBetween(draft, user.id, toId);
    if (existing?.status === "accepted" || existing?.fromId === user.id) return;
    // They already asked us: sending one back is the same as accepting.
    const accept = existing !== undefined || draft.dev.autoAcceptFriends;

    if (existing) existing.status = "accepted";
    else {
      draft.friendRequests.push({
        id: newId("fr"),
        fromId: user.id,
        toId,
        status: accept ? "accepted" : "pending",
        createdAt: nowIso(),
      });
    }
    notify(
      draft,
      toId,
      accept ? "friend_accepted" : "friend_request",
      accept ? `You and ${user.name} are now friends` : `${user.name} sent you a friend request`,
      accept ? "You can see each other's friends-only plans." : "Accept to see each other's friends-only plans.",
      `/u/${user.handle}`,
    );
  });
}

export function acceptFriendRequest(requestId: string) {
  mutate((draft) => {
    const user = requireMe(draft);
    const request = draft.friendRequests.find((r) => r.id === requestId && r.toId === user.id);
    if (!request) return;
    request.status = "accepted";
    notify(
      draft,
      request.fromId,
      "friend_accepted",
      `${user.name} accepted your friend request`,
      "You can see each other's friends-only plans.",
      `/u/${user.handle}`,
    );
  });
}

// Declines or withdraws a pending request, or unfriends.
export function removeFriendship(otherId: string) {
  mutate((draft) => {
    const user = requireMe(draft);
    draft.friendRequests = draft.friendRequests.filter(
      (r) =>
        !(
          (r.fromId === user.id && r.toId === otherId) ||
          (r.fromId === otherId && r.toId === user.id)
        ),
    );
  });
}

// ---------- Notifications ----------

export function markNotificationRead(id: string) {
  if (getDb().notifications.find((n) => n.id === id)?.read !== false) return;
  mutate((draft) => {
    draft.notifications.find((n) => n.id === id)!.read = true;
  });
}

export function markAllNotificationsRead() {
  mutate((draft) => {
    for (const n of draft.notifications) {
      if (n.userId === draft.meId) n.read = true;
    }
  });
}

// ---------- Reviews ----------

export function addReview(activityId: string, rating: number, tags: string[]) {
  mutate((draft) => {
    const user = requireMe(draft);
    const activity = activityById(draft, activityId);
    if (!activity || reviewBy(draft, activityId, user.id)) return;
    draft.reviews.push({
      id: newId("r"),
      activityId,
      hostId: activity.hostId,
      userId: user.id,
      rating,
      tags,
      createdAt: nowIso(),
    });
    notify(
      draft,
      activity.hostId,
      "review",
      `${user.name} rated ${activity.title} ${"★".repeat(rating)}`,
      tags.length > 0 ? tags.join(" · ") : "Thanks for hosting!",
      `/u/me`,
    );
  });
}

// ---------- Clock ----------

const REMINDER_WINDOW_MS = DAY_MS;

type ClockNotification = [
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  href: string,
  key: string,
];

// Creates time-based notifications (reminders, "rate your host") that a server
// would send on a schedule. Safe to call often: each one is created once.
export function runClock() {
  const db = getDb();
  const existing = new Set(db.notifications.map((n) => n.key));
  const due: ClockNotification[] = [];

  for (const join of db.joins) {
    if (join.status !== "going") continue;
    const activity = activityById(db, join.activityId);
    if (!activity || activity.status !== "active" || activity.hostId === join.userId) continue;

    const startsIn = Date.parse(activity.startsAt) - now();
    const reminderKey = `reminder:${join.id}`;
    if (startsIn > 0 && startsIn <= REMINDER_WINDOW_MS && !existing.has(reminderKey)) {
      const hours = Math.max(Math.round(startsIn / HOUR_MS), 1);
      due.push([
        join.userId,
        "reminder",
        `${activity.title} starts in ${hours} hour${hours === 1 ? "" : "s"}`,
        `${activity.venueName}, ${activity.city}. Have your ticket ready.`,
        `/party/${activity.id}`,
        reminderKey,
      ]);
    }

    const reviewKey = `review:${join.id}`;
    if (isPast(activity) && !existing.has(reviewKey) && !reviewBy(db, activity.id, join.userId)) {
      due.push([
        join.userId,
        "review",
        `How was ${activity.title}?`,
        "Rate your host to help others pick good plans.",
        `/party/${activity.id}`,
        reviewKey,
      ]);
    }
  }

  if (due.length === 0) return;
  mutate((draft) => {
    for (const args of due) notify(draft, ...args);
  });
}

// ---------- Dev tools ----------

export function updateDev(patch: Partial<DevSettings>) {
  mutate((draft) => {
    Object.assign(draft.dev, patch);
  });
  runClock();
}

export function advanceTime(ms: number) {
  updateDev({ timeOffsetMs: getDb().dev.timeOffsetMs + ms });
}

// Moves an activity into the past so reviews and payouts can be demoed.
export function endActivityNow(id: string) {
  mutate((draft) => {
    const activity = activityById(draft, id);
    if (!activity) return;
    activity.startsAt = new Date(now() - 2 * HOUR_MS).toISOString();
    activity.endsAt = new Date(now() - 60_000).toISOString();
  });
  runClock();
}

export function resetDemo() {
  resetDb();
}

// ---------- Fake OTP ----------

// No SMS is sent in the prototype: this code always works.
export const DEMO_OTP = "123456";

export function verifyOtp(code: string): boolean {
  return code === DEMO_OTP;
}
