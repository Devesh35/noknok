import type { Handoff, PaymentEnv, PaymentProvider } from "@/lib/payments/types";

// Shapes that cross the API boundary. The server builds them from documents in
// src/server/, the client reads them through src/api/. Money is integer paise
// (fields end in P); dates are UTC ISO strings.

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
  | "entertainment"
  | "event";

export const CATEGORIES_LIST = [
  "sports",
  "social",
  "outdoors",
  "games",
  "food",
  "creative",
  "fitness",
  "music",
  "entertainment",
  "event",
] as const satisfies readonly Category[];


export type Setting = "indoor" | "outdoor";

// Where NokNok operates: the starting towns on the Kalyan line. Areas within
// each are in AREAS_BY_CITY (src/lib/activity.ts).
export const CITIES = ["Ulhasnagar", "Ambernath", "Vitthalwadi", "Kalyan"] as const;
export type City = (typeof CITIES)[number];

export type WaitlistMode = "auto" | "approval";
export type FeeModel = "joiner" | "host";

// ---------- Users ----------

// What anyone may see about a user.
export interface User {
  id: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  city: City;
  bio: string;
  interests: Category[];
  phoneVerified: boolean;
  idVerified: boolean;
}

export interface UserSettings {
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  joinedVisibility: "everyone" | "friends" | "nobody";
}

// The logged-in user's own view of themselves.
export interface Me extends User {
  phone: string; // 10 digits, no country code
  email?: string;
  settings: UserSettings;
  blockedIds: string[];
}

export interface UserStats {
  rating: number; // 0 when unrated
  ratingCount: number;
  hostedCount: number;
  // Share of joined plans the user turned up to, 0-100; null without history.
  attendance: number | null;
}

// ---------- Activities ----------

export interface Activity {
  id: string;
  title: string;
  category: Category;
  subcategory: string; // one of SUBCATEGORIES[category] in src/lib/activity.ts
  description: string;
  hostId: string;
  coverUrl?: string;
  venueName: string;
  address: string;
  city: City;
  area?: string; // locality within the city
  lat?: number;
  lng?: number;
  startsAt: string;
  endsAt: string;
  priceP: number; // 0 = free
  capacity: number;
  visibility: Visibility;
  tags: string[];
  status: "active" | "cancelled";
  waitlistMode: WaitlistMode;
  refundCutoffHours: number;
  shortCode: string;
  // Only sent to the host.
  inviteToken?: string;
  setting: Setting;
  beginnerFriendly: boolean;
  // Created through "quick plan": the host is looking for a few more people.
  quick: boolean;
  goingCount: number;
  waitlistCount: number;
  interestedCount: number;
  createdAt: string;
}

// "left" = the joiner cancelled; "host_cancelled" = the activity was cancelled;
// "pending_payment" holds a spot while the joiner pays; "expired" = they didn't.
export type JoinStatus =
  | "pending_payment"
  | "going"
  | "waitlisted"
  | "left"
  | "host_cancelled"
  | "expired";

// A join doubles as the ticket: its id is what the QR code encodes.
export interface Join {
  id: string;
  activityId: string;
  userId: string;
  status: JoinStatus;
  createdAt: string;
  ticketP: number; // ticket price charged
  feeP: number; // platform fee + GST charged to the joiner
  hostShareP: number; // what the host is owed for this ticket
  refundedP: number;
  invitedBy?: string;
  checkedInAt?: string;
}

export interface PriceBreakdown {
  ticketP: number;
  platformFeeP: number;
  gstP: number;
  totalP: number; // what the joiner pays
  hostReceivesP: number;
}

// ---------- Social ----------

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
  | "joiner_left"
  | "plan_updated"
  | "friend_request"
  | "friend_accepted"
  | "cancelled"
  | "refund"
  | "waitlist_promoted"
  | "waitlist_request"
  | "reminder"
  | "review"
  | "friend_joined"
  | "needs_people"
  | "payment_failed";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
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

// ---------- Dev knobs (the /dev page) ----------

export interface DevSettings {
  autoAcceptFriends: boolean;
  feeModel: FeeModel;
  feePercent: number;
  timeOffsetMs: number;
  failNextPayment: boolean;
}

export type { PaymentEnv, PaymentProvider } from "@/lib/payments/types";

// ---------- Responses (DTOs) ----------

// GET /api/me
export interface SessionDto {
  user: Me | null;
  unread: number;
  dev: DevSettings;
  paymentProvider: PaymentProvider;
  paymentEnv: PaymentEnv;
}

// One card in a list. The server decides what the viewer may see: a locked
// activity has its description, address and coordinates blanked.
export interface ActivityCardItem {
  activity: Activity;
  host: User;
  attendees: User[]; // first few people going, for the faces
  friends: User[]; // the viewer's friends going or hosting
  locked: boolean;
  myJoin: Join | null;
  waitlistPosition: number; // 0 unless myJoin is waitlisted
  interested: boolean;
}

export interface JoinWithUser {
  join: Join;
  user: User;
  inviter?: User;
}

export interface InviteState {
  grantsAccess: boolean;
  refId?: string;
  inviter?: User; // the person behind refId, when they still exist
}

// GET /api/activities/:id
export interface ActivityDetail {
  activity: Activity;
  host: User;
  hostStats: UserStats;
  attendees: User[];
  breakdown: PriceBreakdown;
  refundable: boolean;
  viewer: {
    canView: boolean;
    // The live join (pending/going/waitlisted), or the host_cancelled one so
    // the refund can be shown. Never a "left" or "expired" join.
    join: Join | null;
    waitlistPosition: number;
    interested: boolean;
    friendsGoing: User[];
    mutualWithHost: User[];
    isFriendOfHost: boolean;
    friendRequest: FriendRequest | null;
    review: Review | null;
    invite: InviteState | null;
  };
}

export type PayoutStage = "held" | "pending" | "paid" | "refunded";

export interface EarningsRow {
  activity: Activity;
  tickets: number;
  amountP: number;
  stage: PayoutStage;
  payoutAt: string; // when the payout lands
}

export interface TicketDto {
  join: Join;
  activity: Activity;
}

export interface FriendRequestWithUser {
  request: FriendRequest;
  other: User; // the person who isn't the viewer
}

// GET /api/users/:handle  ("me" for the viewer's own profile)
export interface ProfileDto {
  user: User;
  stats: UserStats;
  isOwn: boolean;
  relationship: {
    isFriend: boolean;
    request: FriendRequest | null;
    blocked: boolean;
  };
  friends: User[];
  mutual: User[];
  hosting: ActivityCardItem[];
  // Empty when the profile's joinedVisibility hides the list from this viewer.
  joined: ActivityCardItem[];
  joinedHidden: boolean;
  past: ActivityCardItem[];
  // Own profile only.
  interested: ActivityCardItem[];
  tickets: TicketDto[];
  incomingRequests: FriendRequestWithUser[];
  outgoingRequests: FriendRequestWithUser[];
  earnings: EarningsRow[];
}

// GET /api/users?q=
export interface PersonResult {
  user: User;
  isFriend: boolean;
  mutualCount: number;
  // Pending request in either direction, so the UI can show "Requested" / Accept.
  request: FriendRequest | null;
}

// GET /api/host
export interface HostHubDto {
  activities: ActivityCardItem[];
  earnings: EarningsRow[];
}

// GET /api/host/:id
export interface HostManageDto {
  activity: Activity; // includes inviteToken
  going: JoinWithUser[];
  waitlist: JoinWithUser[];
  earnings: EarningsRow | null;
}

// POST /api/activities/:id/joins
export interface JoinResult {
  join: Join;
  // What the browser does next: nothing (captured), open a checkout sheet, or
  // go to the gateway's page (redirect).
  handoff: Handoff;
}

export type CheckInResult = "ok" | "already" | "not_found";

// GET /api/geo/search and /api/geo/reverse
export interface GeoPlace {
  id: string;
  name: string; // venue name when the map knows one, else ""
  address: string;
  city: string; // as the map names it
  area: string; // suburb / neighbourhood, e.g. "Andheri West"
  lat: number;
  lng: number;
}

// GET /api/dev
export interface DevDto {
  users: (User & { phone: string })[];
  upcoming: Activity[];
  dev: DevSettings;
}
