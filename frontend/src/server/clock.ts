import "server-only";
import { setTimeOffset, now } from "@/lib/time";
import { connectDb } from "@/server/db";
import { DevSettingsModel, type DevSettingsDoc } from "@/server/models";
import type { DevSettings } from "@/lib/types";

const CACHE_MS = 2000;
let cached: { at: number; value: DevSettings } | null = null;

const DEFAULTS: DevSettings = {
  autoAcceptFriends: false,
  feeModel: "joiner",
  feePercent: 5,
  timeOffsetMs: 0,
  failNextPayment: false,
};

function toSettings(doc: DevSettingsDoc | null): DevSettings {
  if (!doc) return DEFAULTS;
  return {
    autoAcceptFriends: doc.autoAcceptFriends,
    feeModel: doc.feeModel,
    feePercent: doc.feePercent,
    timeOffsetMs: doc.timeOffsetMs,
    failNextPayment: doc.failNextPayment,
  };
}

// The /dev knobs (fee model, fast-forwarded clock, …). Loading them also sets
// the app clock, so call this at the start of every request before now().
export async function devSettings(): Promise<DevSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    setTimeOffset(cached.value.timeOffsetMs);
    return cached.value;
  }
  await connectDb();
  const value = toSettings(await DevSettingsModel.findById("dev").lean());
  cached = { at: Date.now(), value };
  setTimeOffset(value.timeOffsetMs);
  return value;
}

export async function updateDevSettings(patch: Partial<DevSettings>): Promise<DevSettings> {
  await connectDb();
  const doc = await DevSettingsModel.findByIdAndUpdate(
    "dev",
    { $set: patch, $setOnInsert: { _id: "dev" } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  cached = null;
  const value = toSettings(doc);
  setTimeOffset(value.timeOffsetMs);
  return value;
}

export function clearDevCache() {
  cached = null;
}

export function nowDate(): Date {
  return new Date(now());
}

export { now };
