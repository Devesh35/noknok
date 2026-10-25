import { describe, expect, it } from "vitest";
import { rateLimit } from "@/server/ratelimit";

describe("rateLimit", () => {
  it("keeps a live caller's budget when the map overflows", () => {
    // Someone at their limit...
    for (let i = 0; i < 3; i++) rateLimit("victim", 3, 60_000);
    expect(() => rateLimit("victim", 3, 60_000)).toThrow(/Too many/);
    // ...while an attacker burns through thousands of fresh keys.
    for (let i = 0; i < 12_000; i++) rateLimit(`flood:${i}`, 3, 60_000);
    // The flood never reset them (before: buckets.clear() at 10,000 keys).
    expect(() => rateLimit("victim", 3, 60_000)).toThrow(/Too many/);
  });
});
