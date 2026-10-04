export type Visibility = "friends" | "friends_of_friends" | "open";

// What the plan is about. Indoor/outdoor and similar are attributes of an
// activity (see Activity.setting), not categories.
export type Category =
  | "sports"
  | "social"
  | "outdoors"
  | "games"
  | "food"
  | "creative"
  | "fitness"
  | "music"
  | "entertainment";

export type Setting = "indoor" | "outdoor";

export const CITIES = ["Mumbai", "Navi Mumbai", "Thane", "Pune"] as const;
export type City = (typeof CITIES)[number];

export interface User {
  id: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  city: City;
  bio: string;
  phone: string; // 10 digits, no country code
  email?: string;
  interests: Category[];
  phoneVerified: boolean;
  idVerified: boolean;
  // History from before the app's data begins; live reviews and hosted
  // activities are added on top of these.
  baseRating: number;
  baseRatingCount: number;
  baseHostedCount: number;
  // Plans joined / actually attended before the app's data begins.
  baseJoinedCount: number;
  baseAttendedCount: number;
}

export type WaitlistMode = "auto" | "approval";

export interface Activity {
  id: string;
  title: string;
  category: Category;
  description: string;
  hostId: string;
  coverUrl?: string;
  venueName: string;
  address: string;
  city: City;
  lat?: number;
  lng?: number;
  startsAt: string; // ISO
  endsAt: string; // ISO
  priceInr: number; // 0 = free
  capacity: number;
  visibility: Visibility;
  tags: string[];
  status: "active" | "cancelled";
  waitlistMode: WaitlistMode;
  refundCutoffHours: number;
  inviteToken: string;
  shortCode: string;
  createdAt: string;
  setting: Setting;
  beginnerFriendly: boolean;
  // Created through "quick plan": the host is looking for a few more people.
  quick?: boolean;
  seeded?: boolean; // part of the demo data, already counted in the host's history
}

// "left" = the joiner cancelled; "host_cancelled" = the activity was cancelled.
export type JoinStatus = "going" | "waitlisted" | "left" | "host_cancelled";

// A join doubles as the ticket: its id is what the QR code encodes.
export interface Join {
  id: string;
  activityId: string;
  userId: string;
  status: JoinStatus;
  createdAt: string;
  ticketPaid: number; // ticket price charged
  feePaid: number; // platform fee + GST charged to the joiner
  hostShare: number; // what the host is owed for this ticket
  refunded: number;
  invitedBy?: string;
  checkedInAt?: string;
  seeded?: boolean; // demo data, already counted in the user's attendance history
}

export interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  status: "pending" | "accepted";
  createdAt: string;
}

export type NotificationType =
  | "joined"
  | "new_joiner"
  | "friend_request"
  | "friend_accepted"
  | "cancelled"
  | "refund"
  | "waitlist_promoted"
  | "waitlist_request"
  | "reminder"
  | "review"
  | "friend_joined"
  | "needs_people";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  // Set on clock-generated notifications so they are only created once.
  key?: string;
}

export interface Review {
  id: string;
  activityId: string;
  hostId: string;
  userId: string;
  rating: number; // 1-5
  tags: string[];
  createdAt: string;
}

// An invite link that was opened. viewerKey is a user id, or ANON before login.
export interface Invite {
  viewerKey: string;
  activityId: string;
  grantsAccess: boolean; // carried a valid invite token
  refId?: string; // who shared the link
}

export const ANON = "anon";

// "I might go": a softer signal than joining.
export interface Interested {
  userId: string;
  activityId: string;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: "activity" | "user";
  targetId: string;
  reason: string;
  createdAt: string;
}

export interface UserSettings {
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  joinedVisibility: "everyone" | "friends" | "nobody";
  blockedIds: string[];
}

export type FeeModel = "joiner" | "host";

// Knobs on the /dev page.
export interface DevSettings {
  autoAcceptFriends: boolean;
  feeModel: FeeModel;
  feePercent: number;
  timeOffsetMs: number;
  failNextPayment: boolean;
}

export interface Db {
  version: number;
  meId: string | null;
  city: City;
  users: User[];
  activities: Activity[];
  joins: Join[];
  friendRequests: FriendRequest[];
  notifications: AppNotification[];
  reviews: Review[];
  invites: Invite[];
  interested: Interested[];
  reports: Report[];
  userSettings: Record<string, UserSettings>;
  dev: DevSettings;
}
