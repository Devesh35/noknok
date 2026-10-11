import { describe, expect, it } from "vitest";
import { breakdownForPrice, priceBreakdown, ticketFromTotal } from "@/lib/fees";
import type { FriendRequest, Join } from "@/lib/types";
import { buildGraph, canSee, mutualFriendIds } from "@/lib/visibility";
import { joinsToPromote, waitlistPosition } from "@/lib/waitlist";

function friendship(fromId: string, toId: string, status: FriendRequest["status"] = "accepted") {
  return { id: `${fromId}-${toId}`, fromId, toId, status, createdAt: "" };
}

describe("visibility", () => {
  // me - friend - host, and a stranger with no links
  const graph = buildGraph([
    friendship("me", "friend"),
    friendship("friend", "host"),
    friendship("stranger", "host", "pending"),
  ]);
  const by = (visibility: "open" | "friends" | "friends_of_friends") => ({
    hostId: "host",
    visibility,
  });

  it("lets anyone see open activities, logged in or not", () => {
    expect(canSee(null, by("open"), graph)).toBe(true);
    expect(canSee("stranger", by("open"), graph)).toBe(true);
  });

  it("limits friends-only activities to the host's friends", () => {
    expect(canSee("friend", by("friends"), graph)).toBe(true);
    expect(canSee("me", by("friends"), graph)).toBe(false);
    expect(canSee(null, by("friends"), graph)).toBe(false);
  });

  it("extends friends-of-friends to people who share a friend with the host", () => {
    expect(canSee("me", by("friends_of_friends"), graph)).toBe(true);
    expect(canSee("stranger", by("friends_of_friends"), graph)).toBe(false);
    expect(mutualFriendIds(graph, "me", "host")).toEqual(["friend"]);
  });

  it("ignores pending requests", () => {
    expect(canSee("stranger", by("friends"), graph)).toBe(false);
  });

  it("always shows the host their own activity", () => {
    expect(canSee("host", by("friends"), graph)).toBe(true);
  });

  it("lets an invite link through any tier, even when logged out", () => {
    expect(canSee("stranger", by("friends"), graph, true)).toBe(true);
    expect(canSee(null, by("friends"), graph, true)).toBe(true);
  });
});

describe("fees", () => {
  it("adds the fee and GST on top of the ticket in the joiner model", () => {
    expect(priceBreakdown(100000, "joiner", 5)).toEqual({
      ticketP: 100000,
      platformFeeP: 5000,
      gstP: 900,
      totalP: 105900,
      hostReceivesP: 100000,
    });
  });

  it("takes the fee and GST out of the host's share in the host model", () => {
    expect(priceBreakdown(100000, "host", 5)).toEqual({
      ticketP: 100000,
      platformFeeP: 5000,
      gstP: 900,
      totalP: 100000,
      hostReceivesP: 94100,
    });
  });

  it("charges nothing on free activities", () => {
    expect(priceBreakdown(0, "joiner", 5).totalP).toBe(0);
    expect(priceBreakdown(0, "host", 5).hostReceivesP).toBe(0);
  });
});

describe("waitlist", () => {
  const join = (id: string, status: Join["status"], createdAt: string) => ({
    id,
    activityId: "a",
    status,
    createdAt,
  });
  const joins = [
    join("g1", "going", "2026-01-01T10:00:00Z"),
    join("w2", "waitlisted", "2026-01-01T12:00:00Z"),
    join("w1", "waitlisted", "2026-01-01T11:00:00Z"),
    join("gone", "left", "2026-01-01T09:00:00Z"),
  ];
  const activity = { id: "a", capacity: 2, waitlistMode: "auto", status: "active" } as const;

  it("orders the queue first come, first served", () => {
    expect(waitlistPosition(joins, "w1")).toBe(1);
    expect(waitlistPosition(joins, "w2")).toBe(2);
    expect(waitlistPosition(joins, "g1")).toBe(0);
  });

  it("promotes only as many as there are free spots", () => {
    expect(joinsToPromote(joins, activity)).toEqual(["w1"]);
    expect(joinsToPromote(joins, { ...activity, capacity: 3 })).toEqual(["w1", "w2"]);
    expect(joinsToPromote(joins, { ...activity, capacity: 1 })).toEqual([]);
  });

  it("never auto-promotes when the host approves, or the activity is cancelled", () => {
    expect(joinsToPromote(joins, { ...activity, waitlistMode: "approval" })).toEqual([]);
    expect(joinsToPromote(joins, { ...activity, status: "cancelled" })).toEqual([]);
  });
});

describe("ticketFromTotal", () => {
  it("is the total itself when the host pays the fee", () => {
    expect(ticketFromTotal(100000, "host", 5)).toBe(100000);
  });

  it("derives a ticket whose joiner total comes back to what was typed", () => {
    const ticket = ticketFromTotal(52950, "joiner", 5);
    expect(priceBreakdown(ticket, "joiner", 5).totalP).toBe(52950);
  });
});

describe("breakdownForPrice", () => {
  it("keeps the total equal to the price and takes the fee from the host", () => {
    const b = breakdownForPrice(50000, "joiner", 5);
    expect(b.totalP).toBe(50000);
    expect(b.hostReceivesP + b.platformFeeP + b.gstP).toBe(50000);
    expect(breakdownForPrice(50000, "host", 5).totalP).toBe(50000);
    expect(breakdownForPrice(0, "joiner", 5).hostReceivesP).toBe(0);
  });
});
