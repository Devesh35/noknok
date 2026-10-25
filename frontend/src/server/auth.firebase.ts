import "server-only";
import { HOUR_MS } from "@/lib/time";
import { startSession } from "@/server/auth";
import { issueSignupToken } from "@/server/auth.signup";
import { connectDb } from "@/server/db";
import { adminAuth } from "@/server/firebase";
import { UserModel } from "@/server/models";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";
import { adoptAnonInvites } from "@/server/users";

const EXCHANGE_LIMIT = 20;

export type ExchangeResult = { registered: true } | { registered: false; signupToken: string };

// "+919876543210" → "9876543210". Only Indian numbers for now.
function localPhone(e164: string | undefined): string {
  const match = /^\+91(\d{10})$/.exec(e164 ?? "");
  if (!match?.[1]) fail("INVALID", "Only Indian (+91) numbers can use NokNok for now");
  return match[1];
}

// The browser finished Firebase's SMS check and hands us the ID token. We
// verify it, then log in with our own session cookie (PLATFORM_PLAN §2.1).
// Firebase plays no further part: the browser signs out of it right after.
export async function exchangeIdToken(idToken: string, ip: string): Promise<ExchangeResult> {
  rateLimit(`auth:firebase:${ip}`, EXCHANGE_LIMIT, HOUR_MS);
  let decoded: Awaited<ReturnType<ReturnType<typeof adminAuth>["verifyIdToken"]>>;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch (error) {
    if ((error as { code?: string }).code === "NOT_CONFIGURED") throw error;
    console.error("Firebase ID token rejected", (error as { code?: string }).code, (error as Error).message);
    fail("OTP_EXPIRED", "That sign-in has expired. Send a new code.");
  }
  if (decoded.firebase.sign_in_provider !== "phone") fail("FORBIDDEN", "Log in with your phone number");
  const phone = localPhone(decoded.phone_number);

  await connectDb();
  const user = await UserModel.findOne({ phone, deletedAt: { $exists: false } }).lean();
  if (!user) return { registered: false, signupToken: issueSignupToken(decoded.uid, phone) };

  // Accounts made before Firebase pick up their uid on the first login.
  if (user.phoneAuthUid !== decoded.uid) {
    await UserModel.updateOne({ _id: user._id }, { $set: { phoneAuthUid: decoded.uid } });
  }
  await startSession(user._id);
  await adoptAnonInvites(user._id);
  return { registered: true };
}
