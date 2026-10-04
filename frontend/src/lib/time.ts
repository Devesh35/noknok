// The app's clock. The /dev page can fast-forward it, so everything that asks
// "what time is it" goes through now() instead of Date.now().
let offsetMs = 0;

export function setTimeOffset(ms: number) {
  offsetMs = ms;
}

export function now(): number {
  return Date.now() + offsetMs;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
