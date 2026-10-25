import { describe, expect, it } from "vitest";
import { dateRanges, startOfDay } from "@/server/activities.list";

// Pure date arithmetic; the list query itself is covered by the DB suites.
// The app's calendar is Asia/Kolkata (UTC+5:30, no DST); Vercel runs in UTC.
const T = (iso: string) => Date.parse(iso);

describe("startOfDay (Asia/Kolkata)", () => {
  it("places a 2am-IST plan on the IST day, not the UTC one", () => {
    // 2026-10-24 20:30Z is 2026-10-25 02:00 IST.
    expect(new Date(startOfDay(T("2026-10-24T20:30:00Z"))).toISOString()).toBe("2026-10-24T18:30:00.000Z");
  });

  it("is a fixed point", () => {
    const midnight = startOfDay(T("2026-03-01T12:00:00Z"));
    expect(startOfDay(midnight)).toBe(midnight);
    expect(startOfDay(midnight - 1)).toBe(midnight - 24 * 60 * 60 * 1000);
  });
});

describe("dateRanges", () => {
  // Friday 2026-10-23 17:30 IST.
  const friday = T("2026-10-23T12:00:00Z");

  it("today and tomorrow are whole IST days", () => {
    expect(dateRanges("today", friday)).toEqual([
      { $gte: new Date("2026-10-22T18:30:00Z"), $lt: new Date("2026-10-23T18:30:00Z") },
    ]);
    expect(dateRanges("tomorrow", friday)).toEqual([
      { $gte: new Date("2026-10-23T18:30:00Z"), $lt: new Date("2026-10-24T18:30:00Z") },
    ]);
  });

  it("weekend is the coming Saturday and Sunday", () => {
    expect(dateRanges("weekend", friday)).toEqual([
      { $gte: new Date("2026-10-23T18:30:00Z"), $lt: new Date("2026-10-24T18:30:00Z") },
      { $gte: new Date("2026-10-24T18:30:00Z"), $lt: new Date("2026-10-25T18:30:00Z") },
    ]);
  });

  it("weekend on a Sunday keeps today and the next Saturday", () => {
    // Sunday 2026-10-25 10:00 IST.
    const ranges = dateRanges("weekend", T("2026-10-25T04:30:00Z"));
    expect(ranges.map((r) => r.$gte?.toISOString())).toEqual([
      "2026-10-24T18:30:00.000Z", // today (Sunday)
      "2026-10-30T18:30:00.000Z", // next Saturday
      "2026-10-31T18:30:00.000Z", // next Sunday
    ]);
  });

  it("any has no condition; week is a ceiling from now", () => {
    expect(dateRanges("any", friday)).toEqual([]);
    expect(dateRanges("week", friday)).toEqual([{ $lte: new Date(friday + 7 * 24 * 60 * 60 * 1000) }]);
  });
});
