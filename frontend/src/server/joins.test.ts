import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { breakdownForPrice } from "@/lib/fees";
import { ApiError } from "@/lib/errors";

// No request here: the session helpers see an empty cookie jar, so every
// service call runs as the user it is handed and the viewer key is anonymous.
vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
    }),
    headers: async () => ({ get: () => null }),
  };
});

type Modules = {
  joins: typeof import("@/server/joins");
  activities: typeof import("@/server/activities");
  models: typeof import("@/server/models");
  db: typeof import("@/server/db");
  clock: typeof import("@/server/clock");
};

let replSet: MongoMemoryReplSet;
let m: Modules;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("noknok-test");
  process.env.PAYMENT_PROVIDER = "fake";
  m = {
    joins: await import("@/server/joins"),
    activities: await import("@/server/activities"),
    models: await import("@/server/models"),
    db: await import("@/server/db"),
    clock: await import("@/server/clock"),
  };
  await m.db.connectDb();
});

afterAll(async () => {
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  await replSet.stop();
});

let seq = 0;
async function user(name = `person${++seq}`) {
  const doc = await m.models.UserModel.create({
    _id: `u_test${seq}`,
    handle: name,
    name,
    city: "Kalyan",
    phone: `99999${String(seq).padStart(5, "0")}`,
  });
  return doc.toObject();
}

async function plan(hostId: string, capacity: number, priceP = 0, upiId?: string) {
  const start = Date.now() + 2 * 24 * 60 * 60 * 1000;
  return m.models.ActivityModel.create({
    _id: `a_test${++seq}`,
    hostId,
    title: `Plan ${seq}`,
    category: "sports",
    venueName: "Turf",
    city: "Kalyan",
    startsAt: new Date(start),
    endsAt: new Date(start + 60 * 60 * 1000),
    priceP,
    upiId,
    capacity,
    visibility: "open",
    inviteToken: `inv${seq}`,
    shortCode: `CODE${seq}`,
  });
}

describe("capacity", () => {
  it("gives exactly M spots to N parallel joins", async () => {
    const host = await user();
    const activity = await plan(host._id, 5);
    const joiners = await Promise.all(Array.from({ length: 20 }, () => user()));

    const results = await Promise.allSettled(joiners.map((j) => m.joins.requestJoin(j, activity._id)));
    const going = results.filter((r) => r.status === "fulfilled").length;
    const full = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.code === "FULL",
    ).length;
    expect(going).toBe(5);
    expect(full).toBe(15);

    const stored = await m.models.JoinModel.countDocuments({ activityId: activity._id, status: "going" });
    const fresh = await m.models.ActivityModel.findById(activity._id).lean();
    expect(stored).toBe(5);
    expect(fresh?.goingCount).toBe(5);
  });
});

describe("waitlist", () => {
  it("promotes the first waitlisted joiner when someone leaves", async () => {
    const host = await user();
    const activity = await plan(host._id, 1);
    const [first, second, third] = await Promise.all([user(), user(), user()]);

    await m.joins.requestJoin(first, activity._id);
    const w2 = await m.joins.joinWaitlist(second, activity._id);
    const w3 = await m.joins.joinWaitlist(third, activity._id);
    expect(w2.status).toBe("waitlisted");
    expect(w3.status).toBe("waitlisted");

    await m.joins.leaveActivity(first, activity._id);

    const [j2, j3, fresh] = await Promise.all([
      m.models.JoinModel.findById(w2.id).lean(),
      m.models.JoinModel.findById(w3.id).lean(),
      m.models.ActivityModel.findById(activity._id).lean(),
    ]);
    expect(j2?.status).toBe("going");
    expect(j3?.status).toBe("waitlisted");
    expect(fresh?.goingCount).toBe(1);
    expect(fresh?.waitlistCount).toBe(1);
    const promoted = await m.models.NotificationModel.findOne({ userId: second._id, type: "waitlist_promoted" });
    expect(promoted).not.toBeNull();
  });
});

describe("money", () => {
  it("records ticket, fee and host share that add up, and refunds in full on cancel", async () => {
    const dev = await m.clock.devSettings();
    const host = await user();
    const priceP = 79_900;
    const activity = await plan(host._id, 10, priceP);
    const joiner = await user();

    const { join } = await m.joins.requestJoin(joiner, activity._id);
    const price = breakdownForPrice(priceP, dev.feeModel, dev.feePercent);
    expect(join.ticketP + join.feeP).toBe(price.totalP);
    expect(join.ticketP).toBe(price.ticketP);
    expect(join.hostShareP).toBe(price.hostReceivesP);
    expect(price.platformFeeP + price.gstP).toBe(
      dev.feeModel === "joiner" ? price.totalP - price.ticketP : price.ticketP - price.hostReceivesP,
    );

    await m.activities.cancelActivity(host, activity._id);
    const cancelled = await m.models.JoinModel.findById(join.id).lean();
    expect(cancelled?.status).toBe("host_cancelled");
    expect(cancelled?.refundedP).toBe(join.ticketP + join.feeP);
    expect(cancelled?.hostShareP).toBe(0);
  });

  it("a plan paid to the host's UPI id takes no fee and settles the join at once", async () => {
    const host = await user();
    const priceP = 50_000;
    const activity = await plan(host._id, 10, priceP, "host@okaxis");
    const joiner = await user();

    const { join, handoff } = await m.joins.requestJoin(joiner, activity._id);
    expect(handoff).toEqual({ kind: "captured" });
    expect(join.status).toBe("going");
    expect(join.ticketP).toBe(priceP);
    expect(join.feeP).toBe(0);
    expect(join.hostShareP).toBe(priceP);
  });
});
