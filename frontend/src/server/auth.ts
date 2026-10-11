import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { config } from "@/server/config";
import { connectDb } from "@/server/db";
import { fail } from "@/server/respond";
import { SessionModel, UserModel, type UserDoc } from "@/server/models";

const SESSION_DAYS = 30;
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000; // extend at most once a day
const ANON_COOKIE = "nn_anon";

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// The logged-in user for this request, or null. Cached per request so
// layouts, pages and services share one lookup.
export const currentUser = cache(async (): Promise<UserDoc | null> => {
  const token = (await cookies()).get(config.SESSION_COOKIE)?.value;
  if (!token) return null;
  await connectDb();
  const session = await SessionModel.findById(token).lean();
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const user = await UserModel.findOne({ _id: session.userId, deletedAt: { $exists: false } }).lean();
  if (!user) return null;
  if (Date.now() - session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await SessionModel.updateOne({ _id: token }, { $set: { lastSeenAt: new Date(), expiresAt } });
  }
  return user;
});

export async function requireUser(): Promise<UserDoc> {
  const user = await currentUser();
  if (!user) fail("NOT_LOGGED_IN", "Log in to do that");
  return user;
}

// Starts a session for the user and sets the cookie. Route handlers call this
// from OTP verification, registration and the /dev user switcher.
export async function startSession(userId: string) {
  await connectDb();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ua = (await headers()).get("user-agent") ?? undefined;
  await SessionModel.create({ _id: token, userId, expiresAt, lastSeenAt: new Date(), ua });
  (await cookies()).set(config.SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(config.SESSION_COOKIE)?.value;
  if (token) {
    await connectDb();
    await SessionModel.deleteOne({ _id: token });
  }
  store.set(config.SESSION_COOKIE, "", cookieOptions(0));
}

export async function endAllSessions(userId: string) {
  await connectDb();
  await SessionModel.deleteMany({ userId });
  (await cookies()).set(config.SESSION_COOKIE, "", cookieOptions(0));
}

// Identifies a visitor who hasn't logged in, so invite links they open can be
// attached to their account later. Created on first use.
export async function anonKey(): Promise<string> {
  const store = await cookies();
  let value = store.get(ANON_COOKIE)?.value;
  if (!value) {
    value = newToken();
    store.set(ANON_COOKIE, value, cookieOptions(365 * 24 * 60 * 60));
  }
  return `anon:${value}`;
}

export async function existingAnonKey(): Promise<string | null> {
  const value = (await cookies()).get(ANON_COOKIE)?.value;
  return value ? `anon:${value}` : null;
}

// The key invite_opens are stored under for this viewer.
export async function viewerKey(): Promise<string> {
  const user = await currentUser();
  return user ? user._id : await anonKey();
}
