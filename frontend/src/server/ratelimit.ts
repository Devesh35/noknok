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
  if (buckets.size > MAX_KEYS) sweep(nowMs);
}

const MAX_KEYS = 10_000;
// Buckets outlive their window because nothing else touches them; the longest
// window in use is an hour. Dropping idle keys first keeps the map bounded
// without handing every current caller a fresh budget.
const IDLE_MS = 60 * 60 * 1000;

function sweep(nowMs: number) {
  for (const [key, hits] of buckets) {
    const last = hits[hits.length - 1];
    if (last === undefined || nowMs - last > IDLE_MS) buckets.delete(key);
  }
  if (buckets.size <= MAX_KEYS) return;
  // Still too many live keys, which means a flood of fresh ones (each with a
  // hit or two). Drop the emptiest first, so whoever is actually at their
  // limit keeps it; LRU would evict exactly them.
  const byLoad = [...buckets.entries()].sort((a, b) => a[1].length - b[1].length);
  for (const [key] of byLoad.slice(0, buckets.size - MAX_KEYS)) buckets.delete(key);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
