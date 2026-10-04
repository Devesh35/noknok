import { seedActivities, SEED_DEMO_JOINS } from "@/mock/activities";
import {
  DEMO_USER_ID,
  SEED_FRIENDSHIPS,
  SEED_PENDING_REQUESTS,
  SEED_USERS,
} from "@/mock/users";
import type { Activity, Db, FriendRequest, Join, UserSettings } from "@/lib/types";

export const DB_VERSION = 3;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  push: false,
  email: true,
  sms: false,
  whatsapp: true,
  joinedVisibility: "everyone",
  blockedIds: [],
};

const DEFAULT_REFUND_CUTOFF_HOURS = 24;

// The demo database every visitor starts from, and what "Reset demo data"
// restores. Ids are deterministic so shared links keep working after a reset.
export function createSeedDb(): Db {
  const createdAt = new Date().toISOString();

  const joins: Join[] = [];
  const activities: Activity[] = seedActivities().map(({ joinedIds, ...activity }) => {
    const attendees = SEED_DEMO_JOINS.includes(activity.id)
      ? [...joinedIds, DEMO_USER_ID]
      : joinedIds;
    attendees.forEach((userId, index) => {
      joins.push({
        id: `TK-${activity.id}-${userId}`.toUpperCase(),
        activityId: activity.id,
        userId,
        status: "going",
        // Spread out so waitlist order and "joined at" are stable.
        createdAt: new Date(Date.parse(createdAt) - (attendees.length - index) * 60_000).toISOString(),
        ticketPaid: activity.priceInr,
        hostShare: activity.priceInr,
        feePaid: 0,
        refunded: 0,
        seeded: true,
        // Past seeded activities count as attended, so attendance scores start sensible.
        checkedInAt:
          Date.parse(activity.endsAt) < Date.parse(createdAt) ? activity.startsAt : undefined,
      });
    });
    return {
      ...activity,
      status: "active",
      // The full badminton game shows the host-approval flavour of waitlist.
      waitlistMode: activity.id === "a9" ? "approval" : "auto",
      refundCutoffHours: DEFAULT_REFUND_CUTOFF_HOURS,
      inviteToken: `inv-${activity.id}`,
      shortCode: `NOK${activity.id.toUpperCase()}`,
      createdAt,
      seeded: true,
    };
  });

  const friendRequests: FriendRequest[] = [
    ...SEED_FRIENDSHIPS.map(
      ([fromId, toId]): FriendRequest => ({
        id: `fr-${fromId}-${toId}`,
        fromId,
        toId,
        status: "accepted",
        createdAt,
      }),
    ),
    ...SEED_PENDING_REQUESTS.map(
      ([fromId, toId]): FriendRequest => ({
        id: `fr-${fromId}-${toId}`,
        fromId,
        toId,
        status: "pending",
        createdAt,
      }),
    ),
  ];

  const sender = SEED_USERS.find((u) => u.id === SEED_PENDING_REQUESTS[0][0])!;

  return {
    version: DB_VERSION,
    meId: null,
    city: "Mumbai",
    users: SEED_USERS,
    activities,
    joins,
    friendRequests,
    notifications: [
      {
        id: "n-seed-request",
        userId: DEMO_USER_ID,
        type: "friend_request",
        title: `${sender.name} sent you a friend request`,
        body: "Accept to see each other's friends-only plans.",
        href: `/u/${sender.handle}`,
        createdAt,
        read: false,
      },
    ],
    reviews: [],
    invites: [],
    interested: [],
    reports: [],
    userSettings: {},
    dev: {
      autoAcceptFriends: false,
      feeModel: "joiner",
      feePercent: 5,
      timeOffsetMs: 0,
      failNextPayment: false,
    },
  };
}
