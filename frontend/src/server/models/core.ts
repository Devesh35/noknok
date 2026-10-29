import "server-only";
import { Schema } from "mongoose";
import { model, opts } from "@/server/models/base";
import type {
  Category,
  City,
  JoinStatus,
  Setting,
  UserSettings,
  Visibility,
  WaitlistMode,
} from "@/lib/types";

// ---------- users ----------

export interface UserDoc {
  _id: string;
  handle: string;
  name: string;
  avatarUrl?: string;
  city: City;
  bio: string;
  phone: string;
  // Firebase Auth uid of the phone login; used to delete it with the account.
  phoneAuthUid?: string;
  email?: string;
  interests: Category[];
  phoneVerified: boolean;
  idVerified: boolean;
  settings: UserSettings;
  blockedIds: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    handle: { type: String, required: true },
    name: { type: String, required: true },
    avatarUrl: String,
    city: { type: String, required: true },
    bio: { type: String, default: "" },
    phone: { type: String, required: true },
    phoneAuthUid: String,
    email: String,
    interests: { type: [String], default: [] },
    phoneVerified: { type: Boolean, default: true },
    idVerified: { type: Boolean, default: false },
    settings: {
      push: { type: Boolean, default: false },
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: true },
      joinedVisibility: { type: String, default: "everyone" },
    },
    blockedIds: { type: [String], default: [] },
    deletedAt: Date,
  },
  opts,
);
userSchema.index({ handle: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ phoneAuthUid: 1 }, { sparse: true });
export const UserModel = model<UserDoc>("User", userSchema);

// ---------- sessions ----------

export interface SessionDoc {
  _id: string; // the cookie value
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  ua?: string;
  createdAt: Date;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    ua: String,
  },
  opts,
);
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const SessionModel = model<SessionDoc>("Session", sessionSchema);

// ---------- activities ----------

export interface ActivityDoc {
  _id: string;
  hostId: string;
  title: string;
  category: Category;
  subcategory: string;
  description: string;
  coverUrl?: string;
  venueName: string;
  address: string;
  city: City;
  area?: string;
  location?: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
  startsAt: Date;
  endsAt: Date;
  priceP: number;
  upiId?: string;
  capacity: number;
  visibility: Visibility;
  tags: string[];
  status: "active" | "cancelled";
  waitlistMode: WaitlistMode;
  refundCutoffHours: number;
  inviteToken: string;
  shortCode: string;
  setting: Setting;
  beginnerFriendly: boolean;
  quick: boolean;
  goingCount: number;
  waitlistCount: number;
  interestedCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const activitySchema = new Schema<ActivityDoc>(
  {
    _id: { type: String, required: true },
    hostId: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, default: "" },
    description: { type: String, default: "" },
    coverUrl: String,
    venueName: { type: String, required: true },
    address: { type: String, default: "" },
    city: { type: String, required: true },
    area: String,
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] },
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    priceP: { type: Number, default: 0 },
    upiId: String,
    capacity: { type: Number, required: true },
    visibility: { type: String, required: true },
    tags: { type: [String], default: [] },
    status: { type: String, default: "active" },
    waitlistMode: { type: String, default: "auto" },
    refundCutoffHours: { type: Number, default: 24 },
    inviteToken: { type: String, required: true },
    shortCode: { type: String, required: true },
    setting: { type: String, default: "outdoor" },
    beginnerFriendly: { type: Boolean, default: false },
    quick: { type: Boolean, default: false },
    goingCount: { type: Number, default: 0 },
    waitlistCount: { type: Number, default: 0 },
    interestedCount: { type: Number, default: 0 },
    deletedAt: Date,
  },
  opts,
);
activitySchema.index({ city: 1, startsAt: 1 });
activitySchema.index({ hostId: 1 });
activitySchema.index({ shortCode: 1 }, { unique: true });
activitySchema.index({ location: "2dsphere" }, { sparse: true });
activitySchema.index({ title: "text", description: "text", tags: "text", venueName: "text" });
export const ActivityModel = model<ActivityDoc>("Activity", activitySchema);

// ---------- joins ----------

export interface JoinDoc {
  _id: string;
  activityId: string;
  userId: string;
  status: JoinStatus;
  ticketP: number;
  feeP: number;
  hostShareP: number;
  refundedP: number;
  invitedBy?: string;
  checkedInAt?: Date;
  expiresAt?: Date; // pending_payment only
  createdAt: Date;
  updatedAt: Date;
}

const joinSchema = new Schema<JoinDoc>(
  {
    _id: { type: String, required: true },
    activityId: { type: String, required: true },
    userId: { type: String, required: true },
    status: { type: String, required: true },
    ticketP: { type: Number, default: 0 },
    feeP: { type: Number, default: 0 },
    hostShareP: { type: Number, default: 0 },
    refundedP: { type: Number, default: 0 },
    invitedBy: String,
    checkedInAt: Date,
    expiresAt: Date,
  },
  opts,
);
// One live join per person per activity.
joinSchema.index(
  { activityId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending_payment", "going", "waitlisted"] } },
  },
);
joinSchema.index({ userId: 1, status: 1 });
joinSchema.index({ activityId: 1, status: 1, createdAt: 1 });
export const JoinModel = model<JoinDoc>("Join", joinSchema);

