import "server-only";
import mongoose from "mongoose";
import { HOUR_MS } from "@/lib/time";
import type { DevDto, DevSettings } from "@/lib/types";
import { endSession, startSession } from "@/server/auth";
import { clearDevCache, devSettings, now, updateDevSettings } from "@/server/clock";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { toActivity, toUser } from "@/server/dto";
import { tick } from "@/server/jobs";
import { ActivityModel, UserModel } from "@/server/models";
import { fail } from "@/server/respond";
import { adoptAnonInvites } from "@/server/users";

// The hidden /dev page. None of this exists in production.
function guard() {
  if (config.isProd) fail("FORBIDDEN", "Not available");
}

export async function devDto(): Promise<DevDto> {
  guard();
  const dev = await devSettings();
  await connectDb();
  const [users, upcoming] = await Promise.all([
    UserModel.find({ deletedAt: { $exists: false } }).sort({ createdAt: 1 }).lean(),
    ActivityModel.find({ status: "active", deletedAt: { $exists: false }, endsAt: { $gt: new Date(now()) } })
      .sort({ startsAt: 1 })
      .lean(),
  ]);
  return {
    users: users.map((u) => ({ ...toUser(u), phone: u.phone })),
    upcoming: upcoming.map((a) => toActivity(a)),
    dev,
  };
}

export async function devLogin(userId: string): Promise<void> {
  guard();
  await connectDb();
  const user = await UserModel.findOne({ _id: userId, deletedAt: { $exists: false } }).lean();
  if (!user) fail("NOT_FOUND", "No such user");
  await startSession(userId);
  await adoptAnonInvites(userId);
}

export async function updateDev(patch: Partial<DevSettings>): Promise<DevSettings> {
  guard();
  const value = await updateDevSettings(patch);
  await tick();
  return value;
}

export async function advanceTime(ms: number): Promise<DevSettings> {
  guard();
  const dev = await devSettings();
  return updateDev({ timeOffsetMs: dev.timeOffsetMs + ms });
}

// Moves an activity into the past so reviews and payouts can be demoed.
export async function endActivityNow(id: string): Promise<void> {
  guard();
  await devSettings();
  await connectDb();
  await ActivityModel.updateOne(
    { _id: id },
    { $set: { startsAt: new Date(now() - 2 * HOUR_MS), endsAt: new Date(now() - 60_000) } },
  );
  await tick();
}

// Deletes every document in every collection and logs the caller out.
export async function resetDemo(): Promise<void> {
  guard();
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Not connected");
  const collections = await db.listCollections().toArray();
  await Promise.all(collections.map((c) => db.collection(c.name).deleteMany({})));
  await endSession();
  clearDevCache();
}
