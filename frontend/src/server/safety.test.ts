import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError, type ErrorCode } from "@/lib/errors";
import type { ActivityInput } from "@/lib/schemas";
import type { NotificationType } from "@/lib/types";

// Same setup as joins.test.ts: no request, so services run as the user they
// are handed and the viewer key is anonymous.
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
// Account deletion also removes the Firebase user; there is none in tests.
vi.mock("@/server/firebase", () => ({ deleteFirebaseUser: async () => {} }));

type Modules = {
  joins: typeof import("@/server/joins");
  activities: typeof import("@/server/activities");
  users: typeof import("@/server/users");
  models: typeof import("@/server/models");
  db: typeof import("@/server/db");
};

let replSet: MongoMemoryReplSet;
let m: Modules;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("noknok-safety");
  process.env.PAYMENT_PROVIDER = "fake";
  m = {
    joins: await import("@/server/joins"),
    activities: await import("@/server/activities"),
    users: await import("@/server/users"),
    models: await import("@/server/models"),
    db: await import("@/server/db"),
  };
  await m.db.connectDb();
});

afterAll(async () => {
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  await replSet.stop();
});

let seq = 0;
async function user(name = `safe${++seq}`) {
  const doc = await m.models.UserModel.create({
    _id: `u_safe${seq}`,
    handle: name,
    name,
    city: "Kalyan",
    phone: `88888${String(seq).padStart(5, "0")}`,
  });
  return doc.toObject();
}

async function plan(hostId: string, capacity: number, priceP = 0, startInMs = 2 * DAY) {
  const start = Date.now() + startInMs;
  const doc = await m.models.ActivityModel.create({
    _id: `a_safe${++seq}`,
    hostId,
    title: `Plan ${seq}`,
    category: "sports",
    subcategory: "football",
    venueName: "Turf",
    address: "Camp 3, Kalyan",
    city: "Kalyan",
    startsAt: new Date(start),
    endsAt: new Date(start + 60 * 60 * 1000),
    priceP,
    capacity,
    visibility: "open",
    inviteToken: `inv${seq}`,
    shortCode: `SAFE${seq}`,
  });
  return doc.toObject();
}

function inputFrom(a: Awaited<ReturnType<typeof plan>>, patch: Partial<ActivityInput> = {}): ActivityInput {
  return {
    title: a.title,
    category: a.category,
    subcategory: a.subcategory,
    description: "A friendly game for everyone who turns up.",
    venueName: a.venueName,
    address: a.address,
    city: a.city,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    priceP: a.priceP,
    capacity: a.capacity,
    visibility: "open",
    setting: "outdoor",
    beginnerFriendly: true,
    tags: [],
    waitlistMode: "auto",
    refundCutoffHours: 24,
    ...patch,
  };
}

async function rejectsWith(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

const fresh = (id: string) => m.models.ActivityModel.findById(id).lean();
const notificationsOf = (userId: string, type: NotificationType) =>
  m.models.NotificationModel.find({ userId, type }).lean();

describe("account deletion", () => {
  it("cancels the host's upcoming plans and refunds paying joiners", async () => {
    const host = await user();
    const joiner = await user();
    const activity = await plan(host._id, 5, 10_000);
    const { join } = await m.joins.requestJoin(joiner, activity._id);

    await m.users.deleteAccount(host);

    const stored = await m.models.JoinModel.findById(join.id).lean();
    expect((await fresh(activity._id))?.status).toBe("cancelled");
    expect(stored?.status).toBe("host_cancelled");
    expect(stored?.refundedP).toBe(join.ticketP + join.feeP);
    expect(await notificationsOf(joiner._id, "cancelled")).toHaveLength(1);
  });

  it("gives up the deleted joiner's spot instead of leaving a ghost seat", async () => {
    const host = await user();
    const joiner = await user();
    const activity = await plan(host._id, 1);
    await m.joins.requestJoin(joiner, activity._id);

    await m.users.deleteAccount(joiner);

    expect((await fresh(activity._id))?.goingCount).toBe(0);
    const deleted = await m.models.UserModel.findById(joiner._id).lean();
    expect(deleted?.handle).not.toBe(joiner.handle); // handle released
  });
});

describe("blocking", () => {
  it("takes the blocked person off the blocker's plans and keeps them out", async () => {
    const host = await user();
    const pest = await user();
    const activity = await plan(host._id, 5, 10_000);
    const { join } = await m.joins.requestJoin(pest, activity._id);

    await m.users.toggleBlock(host, pest._id);

    const removed = await m.models.JoinModel.findById(join.id).lean();
    expect(removed?.status).toBe("host_cancelled");
    expect(removed?.refundedP).toBe(join.ticketP + join.feeP);
    expect((await fresh(activity._id))?.goingCount).toBe(0);
    await rejectsWith(m.joins.requestJoin(pest, activity._id), "NOT_VISIBLE");
  });
});

describe("editing a plan people joined", () => {
  it("refuses a new price or fewer spots than are taken, and tells joiners about a new time", async () => {
    const host = await user();
    const joiners = [await user(), await user()];
    const activity = await plan(host._id, 4);
    for (const j of joiners) await m.joins.requestJoin(j, activity._id);

    await rejectsWith(m.activities.updateActivity(host, activity._id, inputFrom(activity, { priceP: 50_000 })), "CONFLICT");
    await rejectsWith(m.activities.updateActivity(host, activity._id, inputFrom(activity, { capacity: 1 })), "CONFLICT");

    const later = (d: Date) => new Date(d.getTime() + DAY).toISOString();
    await m.activities.updateActivity(
      host,
      activity._id,
      inputFrom(activity, { startsAt: later(activity.startsAt), endsAt: later(activity.endsAt) }),
    );
    for (const j of joiners) expect(await notificationsOf(j._id, "plan_updated")).toHaveLength(1);
  });

  it("refuses edits to a cancelled plan and starts in the past", async () => {
    const host = await user();
    const activity = await plan(host._id, 4);
    await rejectsWith(
      m.activities.updateActivity(host, activity._id, inputFrom(activity, {
        startsAt: new Date(Date.now() - DAY).toISOString(),
        endsAt: new Date(Date.now() - DAY + 3600_000).toISOString(),
      })),
      "PAST",
    );
    await m.activities.cancelActivity(host, activity._id);
    await rejectsWith(m.activities.updateActivity(host, activity._id, inputFrom(activity)), "CANCELLED");
  });
});

describe("reviews", () => {
  it("only lets people who went rate, once, after it ends", async () => {
    const host = await user();
    const [went, noShow, stranger] = [await user(), await user(), await user()];
    const activity = await plan(host._id, 5);
    const { join } = await m.joins.requestJoin(went, activity._id);
    await m.joins.requestJoin(noShow, activity._id);

    await rejectsWith(m.activities.addReview(went, activity._id, { rating: 5, tags: [] }), "CONFLICT");

    await m.models.JoinModel.updateOne({ _id: join.id }, { $set: { checkedInAt: new Date() } });
    await m.models.ActivityModel.updateOne(
      { _id: activity._id },
      { $set: { startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000) } },
    );

    await rejectsWith(m.activities.addReview(noShow, activity._id, { rating: 1, tags: [] }), "FORBIDDEN");
    await rejectsWith(m.activities.addReview(stranger, activity._id, { rating: 1, tags: [] }), "FORBIDDEN");
    await m.activities.addReview(went, activity._id, { rating: 4, tags: [] });
    await rejectsWith(m.activities.addReview(went, activity._id, { rating: 5, tags: [] }), "CONFLICT");
    expect(await m.models.ReviewModel.countDocuments({ activityId: activity._id })).toBe(1);
  });

  it("prompts only people who can actually rate once check-in was used", async () => {
    const { tick } = await import("@/server/jobs");
    const host = await user();
    const [went, noShow] = [await user(), await user()];
    const activity = await plan(host._id, 5);
    const { join } = await m.joins.requestJoin(went, activity._id);
    await m.joins.requestJoin(noShow, activity._id);
    await m.models.JoinModel.updateOne({ _id: join.id }, { $set: { checkedInAt: new Date() } });
    await m.models.ActivityModel.updateOne(
      { _id: activity._id },
      { $set: { startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000) } },
    );
    await tick();
    expect(await notificationsOf(went._id, "review")).toHaveLength(1);
    expect(await notificationsOf(noShow._id, "review")).toHaveLength(0);
  });

  it("prompts everyone who went when the host never checked anyone in", async () => {
    const { tick } = await import("@/server/jobs");
    const host = await user();
    const [a, b] = [await user(), await user()];
    const activity = await plan(host._id, 5);
    await m.joins.requestJoin(a, activity._id);
    await m.joins.requestJoin(b, activity._id);
    await m.models.ActivityModel.updateOne(
      { _id: activity._id },
      { $set: { startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000) } },
    );
    await tick();
    expect(await notificationsOf(a._id, "review")).toHaveLength(1);
    expect(await notificationsOf(b._id, "review")).toHaveLength(1);
  });
});

describe("leaving", () => {
  it("can't be used after the plan ended to erase a no-show", async () => {
    const host = await user();
    const joiner = await user();
    const activity = await plan(host._id, 5);
    await m.joins.requestJoin(joiner, activity._id);
    await m.models.ActivityModel.updateOne(
      { _id: activity._id },
      { $set: { startsAt: new Date(Date.now() - 2 * 3600_000), endsAt: new Date(Date.now() - 3600_000) } },
    );
    await rejectsWith(m.joins.leaveActivity(joiner, activity._id), "PAST");
    expect(await m.models.JoinModel.countDocuments({ activityId: activity._id, status: "going" })).toBe(1);
  });
});

describe("join notifications", () => {
  it("report the real spot count when one person's joins race", async () => {
    const host = await user();
    const joiner = await user();
    const activity = await plan(host._id, 6);

    await Promise.allSettled([1, 2, 3].map(() => m.joins.requestJoin(joiner, activity._id)));

    const [note] = await notificationsOf(host._id, "new_joiner");
    expect(note?.body).toBe("1/6 spots are taken.");
  });
});
