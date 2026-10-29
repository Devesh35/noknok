import "server-only";
import mongoose, { Schema } from "mongoose";
import { model, opts } from "@/server/models/base";
import type { SettlingProvider } from "@/lib/payments/types";
import type { DevSettings, FeeModel } from "@/lib/types";

// ---------- payments ----------

// One per gateway order. merchantOrderId is ours (Razorpay gets it as the
// receipt); provider* ids are the gateway's.
export interface PaymentDoc {
  _id: string;
  joinId: string;
  provider: SettlingProvider;
  merchantOrderId: string;
  providerOrderId: string;
  providerPaymentId?: string;
  amountP: number;
  status: "created" | "captured" | "failed" | "refunded" | "partially_refunded";
  providerRefundId?: string;
  // Set while a refund is owed but the gateway hasn't confirmed it; cleared
  // when it does. The job tick retries these.
  refundOwedP?: number;
  // When the current refund attempt started; a lease between overlapping
  // ticks and requests (payments.ts claimRefund).
  refundAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    _id: { type: String, required: true },
    joinId: { type: String, required: true },
    provider: { type: String, required: true },
    merchantOrderId: { type: String, required: true },
    providerOrderId: { type: String, required: true },
    providerPaymentId: String,
    amountP: { type: Number, required: true },
    status: { type: String, required: true },
    providerRefundId: String,
    refundOwedP: Number,
    refundAttemptAt: Date,
  },
  opts,
);
paymentSchema.index({ merchantOrderId: 1 }, { unique: true });
paymentSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true });
// Partial, not sparse: a compound sparse index still indexes every payment
// (provider is always set), so uncaptured ones would collide on null.
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $exists: true } } },
);
paymentSchema.index({ joinId: 1 });
export const PaymentModel = model<PaymentDoc>("Payment", paymentSchema);

// ---------- webhook_events ----------

// Idempotency for gateway webhooks: a redelivery stops at the primary key.
export interface WebhookEventDoc {
  _id: string; // `${provider}:${eventId}`
  provider: SettlingProvider;
  event: string;
  payload: unknown;
  receivedAt: Date;
  processedAt?: Date;
}

const webhookEventSchema = new Schema<WebhookEventDoc>(
  {
    _id: { type: String, required: true },
    provider: { type: String, required: true },
    event: { type: String, required: true },
    payload: Schema.Types.Mixed,
    receivedAt: { type: Date, required: true },
    processedAt: Date,
  },
  { strict: "throw", versionKey: false, collection: "webhook_events" },
);
// Raw payloads are for debugging a dispute, not for keeping; gateways stop
// redelivering long before this.
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
export const WebhookEventModel = model<WebhookEventDoc>("WebhookEvent", webhookEventSchema);

// ---------- payouts ----------

export interface PayoutDoc {
  _id: string;
  hostId: string;
  amountP: number;
  periodStart: Date;
  periodEnd: Date;
  status: "pending" | "paid" | "failed";
  reference?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const payoutSchema = new Schema<PayoutDoc>(
  {
    _id: { type: String, required: true },
    hostId: { type: String, required: true },
    amountP: { type: Number, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    status: { type: String, default: "pending" },
    reference: String,
    paidAt: Date,
  },
  opts,
);
payoutSchema.index({ hostId: 1, status: 1 });
export const PayoutModel = model<PayoutDoc>("Payout", payoutSchema);

// ---------- device_tokens ----------

export interface DeviceTokenDoc {
  _id: string;
  userId: string;
  platform: "web" | "android" | "ios";
  token: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deviceTokenSchema = new Schema<DeviceTokenDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    platform: { type: String, required: true },
    token: { type: String, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { ...opts, collection: "device_tokens" },
);
deviceTokenSchema.index({ userId: 1 });
deviceTokenSchema.index({ token: 1 }, { unique: true });
export const DeviceTokenModel = model<DeviceTokenDoc>("DeviceToken", deviceTokenSchema);

// ---------- audit_log ----------

export interface AuditDoc {
  _id: mongoose.Types.ObjectId;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  data?: unknown;
  createdAt: Date;
}

const auditSchema = new Schema<AuditDoc>(
  {
    actorId: String,
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    data: Schema.Types.Mixed,
  },
  { strict: "throw", versionKey: false, collection: "audit_log", timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
export const AuditModel = model<AuditDoc>("Audit", auditSchema);

// ---------- app_settings (singleton docs) ----------

export interface DevSettingsDoc extends DevSettings {
  _id: "dev";
  feeModel: FeeModel;
}

const devSettingsSchema = new Schema<DevSettingsDoc>(
  {
    _id: { type: String, required: true },
    autoAcceptFriends: { type: Boolean, default: false },
    feeModel: { type: String, default: "joiner" },
    feePercent: { type: Number, default: 5 },
    timeOffsetMs: { type: Number, default: 0 },
    failNextPayment: { type: Boolean, default: false },
  },
  { strict: "throw", versionKey: false, collection: "app_settings" },
);
export const DevSettingsModel = model<DevSettingsDoc>("DevSettings", devSettingsSchema);

// ---------- images (uploaded cover photos) ----------

export interface ImageDoc {
  _id: string;
  userId: string;
  contentType: string;
  data: Buffer;
  size: number;
  createdAt: Date;
}

const imageSchema = new Schema<ImageDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
  },
  { strict: "throw", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);
imageSchema.index({ userId: 1 });
export const ImageModel = model<ImageDoc>("Image", imageSchema);
