import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The signup token issued after Firebase proves a number. The Firebase
// exchange itself is not unit-tested: it needs the real project.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
  headers: async () => ({ get: () => null }),
}));

type Modules = {
  firebaseAuth: typeof import("@/server/auth.firebase");
  signup: typeof import("@/server/auth.signup");
  users: typeof import("@/server/users");
  firebase: typeof import("@/server/firebase");
  models: typeof import("@/server/models");
  db: typeof import("@/server/db");
};

let replSet: MongoMemoryReplSet;
let m: Modules;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri("noknok-auth");
  m = {
    firebaseAuth: await import("@/server/auth.firebase"),
    signup: await import("@/server/auth.signup"),
    users: await import("@/server/users"),
    firebase: await import("@/server/firebase"),
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

describe("signup token", () => {
  it("round-trips the number Firebase proved", () => {
    const token = m.signup.issueSignupToken("uid_1", "9876543210");
    expect(m.signup.readSignupToken(token)).toEqual({ phoneAuthUid: "uid_1", phone: "9876543210" });
  });

  it("rejects a token whose number was changed", () => {
    const token = m.signup.issueSignupToken("uid_1", "9876543210");
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(Buffer.from(payload!, "base64url").toString().replace("9876543210", "9000000000"));
    expect(() => m.signup.readSignupToken(`${forged.toString("base64url")}.${signature}`)).toThrow();
    expect(() => m.signup.readSignupToken("garbage")).toThrow();
  });

  it("expires after 15 minutes", () => {
    vi.useFakeTimers();
    try {
      const token = m.signup.issueSignupToken("uid_1", "9876543210");
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(() => m.signup.readSignupToken(token)).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
