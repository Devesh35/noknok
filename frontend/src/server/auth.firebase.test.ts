import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Phone login against the real Firebase Auth emulator (`npm test` starts it
// through `firebase emulators:exec`). The signup-token tests need no emulator.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
  headers: async () => ({ get: () => null }),
}));

const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = "demo-noknok";

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

// The emulator's REST API stands in for the browser SDK: send a code, read it
// back from the emulator, sign in, get an ID token.
async function emulatorCall<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`http://${EMULATOR}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function phoneIdToken(phoneNumber: string): Promise<string> {
  const { sessionInfo } = await emulatorCall<{ sessionInfo: string }>(
    "/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake",
    { phoneNumber, recaptchaToken: "ignored" },
  );
  const { verificationCodes } = await emulatorCall<{ verificationCodes: { sessionInfo: string; code: string }[] }>(
    `/emulator/v1/projects/${PROJECT}/verificationCodes`,
  );
  const code = verificationCodes.find((c) => c.sessionInfo === sessionInfo)?.code;
  const { idToken } = await emulatorCall<{ idToken: string }>(
    "/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=fake",
    { sessionInfo, code },
  );
  return idToken;
}

describe.skipIf(!EMULATOR)("phone login through Firebase", () => {
  it("signs up a new number, then logs it in", async () => {
    const first = await m.firebaseAuth.exchangeIdToken(await phoneIdToken("+919811100001"), "test-ip-1");
    expect(first.registered).toBe(false);
    if (first.registered) return;

    const me = await m.users.register({ signupToken: first.signupToken, name: "Asha Rao", city: "Kalyan" }, "test-ip-1");
    expect(me.phone).toBe("9811100001");
    const stored = await m.models.UserModel.findById(me.id).lean();
    expect(stored?.phoneAuthUid).toBeTruthy();
    expect(jar.get("nn_session")).toBeTruthy();

    const again = await m.firebaseAuth.exchangeIdToken(await phoneIdToken("+919811100001"), "test-ip-1");
    expect(again).toEqual({ registered: true });
  });

  it("won't create a second account for the same number", async () => {
    const first = await m.firebaseAuth.exchangeIdToken(await phoneIdToken("+919811100002"), "test-ip-2");
    if (first.registered) throw new Error("expected a new number");
    await m.users.register({ signupToken: first.signupToken, name: "One", city: "Kalyan" }, "test-ip-2");
    await expect(
      m.users.register({ signupToken: first.signupToken, name: "Two", city: "Kalyan" }, "test-ip-2"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses numbers outside India and non-phone sign-ins", async () => {
    await expect(
      m.firebaseAuth.exchangeIdToken(await phoneIdToken("+14155550100"), "test-ip-3"),
    ).rejects.toMatchObject({ code: "INVALID" });

    const { idToken } = await emulatorCall<{ idToken: string }>(
      "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake",
      { email: "someone@example.com", password: "secret123", returnSecureToken: true },
    );
    await expect(m.firebaseAuth.exchangeIdToken(idToken, "test-ip-3")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(m.firebaseAuth.exchangeIdToken("not-a-token-at-all-really", "test-ip-3")).rejects.toMatchObject({
      code: "OTP_EXPIRED",
    });
  });

  it("deletes the Firebase user with the account, so the number can sign up again", async () => {
    const first = await m.firebaseAuth.exchangeIdToken(await phoneIdToken("+919811100004"), "test-ip-4");
    if (first.registered) throw new Error("expected a new number");
    const me = await m.users.register({ signupToken: first.signupToken, name: "Leaving", city: "Kalyan" }, "test-ip-4");
    const user = (await m.models.UserModel.findById(me.id).lean())!;
    await m.users.deleteAccount(user);
    await expect(m.firebase.adminAuth().getUser(user.phoneAuthUid!)).rejects.toMatchObject({
      code: "auth/user-not-found",
    });
    const fresh = await m.firebaseAuth.exchangeIdToken(await phoneIdToken("+919811100004"), "test-ip-4");
    expect(fresh.registered).toBe(false);
  });
});
