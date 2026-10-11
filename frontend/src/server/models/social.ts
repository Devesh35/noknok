import "server-only";
import mongoose, { Schema } from "mongoose";
import { model, opts } from "@/server/models/base";
import type { NotificationType } from "@/lib/types";

// ---------- friend_requests ----------

export interface FriendRequestDoc {
  _id: string;
  fromId: string;
  toId: string;
  status: "pending" | "accepted";
  createdAt: Date;
  updatedAt: Date;
}

const friendRequestSchema = new Schema<FriendRequestDoc>(
  {
    _id: { type: String, required: true },
    fromId: { type: String, required: true },
    toId: { type: String, required: true },
    status: { type: String, default: "pending" },
  },
  { ...opts, collection: "friend_requests" },
);
friendRequestSchema.index({ fromId: 1, toId: 1 }, { unique: true });
friendRequestSchema.index({ toId: 1, status: 1 });
export const FriendRequestModel = model<FriendRequestDoc>("FriendRequest", friendRequestSchema);

// ---------- notifications ----------

export interface NotificationDoc {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  read: boolean;
  key?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    href: { type: String, required: true },
    read: { type: Boolean, default: false },
    key: String,
  },
  opts,
);
notificationSchema.index({ userId: 1, createdAt: -1 });
// Keyed notifications (reminders, review prompts) are created once per key.
// A partial index, not sparse: userId is always set, so sparse would index
// keyless rows as null and reject the second plain notification per user.
notificationSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { key: { $exists: true } } },
);
export const NotificationModel = model<NotificationDoc>("Notification", notificationSchema);

// ---------- reviews ----------

export interface ReviewDoc {
  _id: string;
  activityId: string;
  hostId: string;
  userId: string;
  rating: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    _id: { type: String, required: true },
    activityId: { type: String, required: true },
    hostId: { type: String, required: true },
    userId: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    tags: { type: [String], default: [] },
  },
  opts,
);
reviewSchema.index({ activityId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ hostId: 1 });
export const ReviewModel = model<ReviewDoc>("Review", reviewSchema);

// ---------- invite_opens ----------

export interface InviteOpenDoc {
  _id: string; // `${viewerKey}:${activityId}`
  viewerKey: string; // user id, or "anon:<cookie>" before login
  activityId: string;
  grantsAccess: boolean;
  refId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const inviteOpenSchema = new Schema<InviteOpenDoc>(
  {
    _id: { type: String, required: true },
    viewerKey: { type: String, required: true },
    activityId: { type: String, required: true },
    grantsAccess: { type: Boolean, default: false },
    refId: String,
  },
  { ...opts, collection: "invite_opens" },
);
inviteOpenSchema.index({ viewerKey: 1 });
export const InviteOpenModel = model<InviteOpenDoc>("InviteOpen", inviteOpenSchema);

// ---------- interested ----------

export interface InterestedDoc {
  _id: string; // `${userId}:${activityId}`
  userId: string;
  activityId: string;
  createdAt: Date;
  updatedAt: Date;
}

const interestedSchema = new Schema<InterestedDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    activityId: { type: String, required: true },
  },
  { ...opts, collection: "interested" },
);
interestedSchema.index({ activityId: 1 });
interestedSchema.index({ userId: 1 });
export const InterestedModel = model<InterestedDoc>("Interested", interestedSchema);

// ---------- reports ----------

export interface ReportDoc {
  _id: string;
  reporterId: string;
  targetType: "activity" | "user";
  targetId: string;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<ReportDoc>(
  {
    _id: { type: String, required: true },
    reporterId: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    reason: { type: String, required: true },
  },
  opts,
);
export const ReportModel = model<ReportDoc>("Report", reportSchema);

