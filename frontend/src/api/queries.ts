// Read-side of the mock backend: pure functions over a Db snapshot.
import { DEFAULT_USER_SETTINGS } from "@/mock/seed";
import { PAYOUT_DELAY_DAYS, priceBreakdown, type PriceBreakdown } from "@/lib/fees";
import { DAY_MS, HOUR_MS, now } from "@/lib/time";
import {
  ANON,
  type Activity,
  type AppNotification,
  type Db,
  type FriendRequest,
  type Join,
  type Review,
  type User,
  type UserSettings,
} from "@/lib/types";
import {
  buildGraph,
  canSee,
  friendIds,
  mutualFriendIds,
  type FriendGraph,
} from "@/lib/visibility";
import { waitlistOf } from "@/lib/waitlist";

// ---------- Users ----------

export function me(db: Db): User | null {
  return db.users.find((u) => u.id === db.meId) ?? null;
}

export function userById(db: Db, id: string): User | undefined {
  return db.users.find((u) => u.id === id);
}

export function userByHandle(db: Db, handle: string): User | undefined {
  return db.users.find((u) => u.handle === handle);
}

export function userByPhone(db: Db, phone: string): User | undefined {
  return db.users.find((u) => u.phone === phone);
}

export function isHandleTaken(db: Db, handle: string, exceptUserId?: string): boolean {
  return handle === "me" || db.users.some((u) => u.handle === handle && u.id !== exceptUserId);
}

export function settingsFor(db: Db, userId: string): UserSettings {
  return db.userSettings[userId] ?? DEFAULT_USER_SETTINGS;
}

// Users the current user has blocked.
export function blockedIds(db: Db): string[] {
  return db.meId ? settingsFor(db, db.meId).blockedIds : [];
}

// ---------- Friends ----------

const graphCache = new WeakMap<FriendRequest[], FriendGraph>();

export function graphOf(db: Db): FriendGraph {
  let graph = graphCache.get(db.friendRequests);
  if (!graph) {
    graph = buildGraph(db.friendRequests);
    graphCache.set(db.friendRequests, graph);
  }
  return graph;
}

export function friendsOf(db: Db, userId: string): User[] {
  return friendIds(graphOf(db), userId)
    .map((id) => userById(db, id))
    .filter((u): u is User => u !== undefined);
}

export function mutualFriends(db: Db, a: string, b: string): User[] {
  return mutualFriendIds(graphOf(db), a, b)
    .map((id) => userById(db, id))
    .filter((u): u is User => u !== undefined);
}

export function requestBetween(db: Db, a: string, b: string): FriendRequest | undefined {
  return db.friendRequests.find(
    (r) => (r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a),
  );
}

export function incomingRequests(db: Db, userId: string): FriendRequest[] {
  return db.friendRequests.filter((r) => r.toId === userId && r.status === "pending");
}

// ---------- Activities & joins ----------

export function activityById(db: Db, id: string): Activity | undefined {
  return db.activities.find((a) => a.id === id);
}

export function activityByCode(db: Db, code: string): Activity | undefined {
  return db.activities.find((a) => a.shortCode === code.toUpperCase());
}

export function isPast(activity: Activity): boolean {
  return Date.parse(activity.endsAt) < now();
}

export function goingJoins(db: Db, activityId: string): Join[] {
  return db.joins
    .filter((j) => j.activityId === activityId && j.status === "going")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function waitlistJoins(db: Db, activityId: string): Join[] {
  return waitlistOf(db.joins, activityId);
}

export function spotsLeft(db: Db, activity: Activity): number {
  return Math.max(activity.capacity - goingJoins(db, activity.id).length, 0);
}

// The user's live join (going or waitlisted) for an activity, if any.
export function activeJoin(db: Db, activityId: string, userId: string | null): Join | undefined {
  if (!userId) return undefined;
  return db.joins.find(
    (j) =>
      j.activityId === activityId &&
      j.userId === userId &&
      (j.status === "going" || j.status === "waitlisted"),
  );
}

export function isGoing(db: Db, activityId: string, userId: string): boolean {
  return activeJoin(db, activityId, userId)?.status === "going";
}

// Joins that hold a ticket, newest first (includes ones the host cancelled).
export function ticketsOf(db: Db, userId: string): Join[] {
  return db.joins
    .filter((j) => j.userId === userId && (j.status === "going" || j.status === "host_cancelled"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function hostedCount(db: Db, userId: string): number {
  const user = userById(db, userId);
  const created = db.activities.filter((a) => a.hostId === userId && !a.seeded).length;
  return (user?.baseHostedCount ?? 0) + created;
}

// ---------- Interested ----------

export function isInterested(db: Db, activityId: string, userId: string | null): boolean {
  return db.interested.some((i) => i.userId === userId && i.activityId === activityId);
}

export function interestedCount(db: Db, activityId: string): number {
  return db.interested.filter((i) => i.activityId === activityId).length;
}

// ---------- Reliability ----------

// Share of joined plans the user actually turned up to (hosts check people
// in). null until there is any history to judge by.
export function attendanceOf(db: Db, userId: string): number | null {
  const user = userById(db, userId);
  const past = db.joins.filter((j) => {
    if (j.userId !== userId || j.status !== "going" || j.seeded) return false;
    const activity = activityById(db, j.activityId);
    return activity !== undefined && activity.status === "active" && isPast(activity);
  });
  const joined = (user?.baseJoinedCount ?? 0) + past.length;
  if (joined === 0) return null;
  const attended = (user?.baseAttendedCount ?? 0) + past.filter((j) => j.checkedInAt).length;
  return Math.round((attended / joined) * 100);
}

// Friends of the viewer who are going to, or hosting, an activity.
export function friendsGoing(db: Db, activity: Activity, viewerId: string | null): User[] {
  if (!viewerId) return [];
  return friendsOf(db, viewerId).filter(
    (friend) => friend.id === activity.hostId || isGoing(db, activity.id, friend.id),
  );
}

// ---------- Visibility & invites ----------

function viewerKey(db: Db): string {
  return db.meId ?? ANON;
}

export function inviteFor(db: Db, activityId: string) {
  return db.invites.find((i) => i.viewerKey === viewerKey(db) && i.activityId === activityId);
}

export function canView(db: Db, activity: Activity): boolean {
  const going = db.meId ? isGoing(db, activity.id, db.meId) : false;
  const invited = inviteFor(db, activity.id)?.grantsAccess ?? false;
  return canSee(db.meId, activity, graphOf(db), invited || going);
}

// ---------- Money ----------

export function breakdownFor(db: Db, activity: Activity): PriceBreakdown {
  return priceBreakdown(activity.priceInr, db.dev.feeModel, db.dev.feePercent);
}

// A joiner who leaves before the cutoff gets everything back.
export function isRefundable(activity: Activity): boolean {
  return now() < Date.parse(activity.startsAt) - activity.refundCutoffHours * HOUR_MS;
}

export type PayoutStage = "held" | "pending" | "paid" | "refunded";

export interface EarningsRow {
  activity: Activity;
  tickets: number;
  amount: number;
  stage: PayoutStage;
  payoutAt: number; // ms timestamp when the payout lands
}

// Money is held until the activity ends, then paid out T+2.
export function earningsOf(db: Db, hostId: string): EarningsRow[] {
  return db.activities
    .filter((a) => a.hostId === hostId && a.priceInr > 0)
    .map((activity) => {
      const paid = goingJoins(db, activity.id);
      const payoutAt = Date.parse(activity.endsAt) + PAYOUT_DELAY_DAYS * DAY_MS;
      let stage: PayoutStage;
      if (activity.status === "cancelled") stage = "refunded";
      else if (!isPast(activity)) stage = "held";
      else stage = now() < payoutAt ? "pending" : "paid";
      return {
        activity,
        tickets: paid.length,
        amount: paid.reduce((sum, j) => sum + j.hostShare, 0),
        stage,
        payoutAt,
      };
    })
    .sort((a, b) => b.activity.startsAt.localeCompare(a.activity.startsAt));
}

// ---------- Reviews ----------

export function reviewBy(db: Db, activityId: string, userId: string): Review | undefined {
  return db.reviews.find((r) => r.activityId === activityId && r.userId === userId);
}

// Seed history blended with reviews left in the app.
export function hostRating(db: Db, userId: string): { rating: number; count: number } {
  const user = userById(db, userId);
  const reviews = db.reviews.filter((r) => r.hostId === userId);
  const baseCount = user?.baseRatingCount ?? 0;
  const count = baseCount + reviews.length;
  if (count === 0) return { rating: 0, count: 0 };
  const total = (user?.baseRating ?? 0) * baseCount + reviews.reduce((s, r) => s + r.rating, 0);
  return { rating: total / count, count };
}

// ---------- Notifications ----------

export function notificationsFor(db: Db, userId: string): AppNotification[] {
  return db.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCount(db: Db): number {
  return db.notifications.filter((n) => n.userId === db.meId && !n.read).length;
}

// Phone number of the seeded demo account, shown as a hint on the login screen.
export { DEMO_PHONE } from "@/mock/users";
