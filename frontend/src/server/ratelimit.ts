import "server-only";
import { fail } from "@/server/respond";

// Per-instance sliding window. Good enough for abuse on OTP sends and joins
// in a small deployment; swap for Upstash Ratelimit when there are many
// instances (each one counts separately today).
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const nowMs = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => nowMs - t < windowMs);
  if (hits.length >= limit) fail("RATE_LIMITED", "Too many attempts. Try again in a bit.");
  hits.push(nowMs);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear();
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
