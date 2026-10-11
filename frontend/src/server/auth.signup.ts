import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import { fail } from "@/server/respond";

// A new number has proven itself through Firebase but has no account yet.
// This token carries that proof to POST /users for 15 minutes: an HMAC over
// `phoneAuthUid|phone|expiry`, so nothing has to be stored (it replaces the
// old otp_codes.signupToken row).
const TTL_MS = 15 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", config.signupTokenSecret).update(payload).digest("base64url");
}

export function issueSignupToken(phoneAuthUid: string, phone: string): string {
  const payload = `${phoneAuthUid}|${phone}|${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readSignupToken(token: string): { phoneAuthUid: string; phone: string } {
  const [encoded, signature] = token.split(".");
  const payload = encoded ? Buffer.from(encoded, "base64url").toString("utf8") : "";
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature ?? "");
  const [phoneAuthUid, phone, expiry] = payload.split("|");
  const valid =
    expected.length === given.length &&
    timingSafeEqual(expected, given) &&
    !!phoneAuthUid &&
    /^\d{10}$/.test(phone ?? "") &&
    Number(expiry) > Date.now();
  if (!valid || !phone) fail("OTP_EXPIRED", "Verify your number again");
  return { phoneAuthUid, phone };
}
