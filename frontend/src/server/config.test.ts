import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads process.env once at import, so each case gets a fresh module.
const BASE = {
  NODE_ENV: "development",
  MONGODB_URI: "",
  DEV_TOOLS: "",
  JOB_SECRET: "",
  CRON_SECRET: "",
  PAYMENT_PROVIDER: "fake",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  FIREBASE_SERVICE_ACCOUNT_JSON: "",
  SIGNUP_TOKEN_SECRET: "",
  NEXT_PHASE: "",
};

async function load(env: Partial<typeof BASE>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...BASE, ...env })) {
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
  return (await import("@/server/config")).config;
}

afterEach(() => {
  for (const name of Object.keys(BASE)) delete process.env[name];
});

describe("devTools", () => {
  it("is on by default only with the in-memory database", async () => {
    expect((await load({})).devTools).toBe(true);
    expect((await load({ MONGODB_URI: "mongodb+srv://u:p@dev.example.net/noknok" })).devTools).toBe(false);
  });

  it("can be switched on against a real database, with a strict boolean", async () => {
    const uri = "mongodb+srv://u:p@dev.example.net/noknok";
    expect((await load({ MONGODB_URI: uri, DEV_TOOLS: "1" })).devTools).toBe(true);
    expect((await load({ MONGODB_URI: uri, DEV_TOOLS: "true" })).devTools).toBe(true);
    expect((await load({ MONGODB_URI: uri, DEV_TOOLS: "0" })).devTools).toBe(false);
    await expect(load({ MONGODB_URI: uri, DEV_TOOLS: "yes" })).rejects.toThrow(/Invalid environment/);
  });
});

describe("production boot", () => {
  const prod = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb+srv://u:p@prod.example.net/noknok",
    FIREBASE_SERVICE_ACCOUNT_JSON: "e30=",
    SIGNUP_TOKEN_SECRET: "s",
    PAYMENT_PROVIDER: "razorpay",
    RAZORPAY_KEY_ID: "rzp_live_x",
    RAZORPAY_KEY_SECRET: "x",
    RAZORPAY_WEBHOOK_SECRET: "w",
    CRON_SECRET: "c",
  };

  it("never exposes dev tools, whatever DEV_TOOLS says", async () => {
    expect((await load({ ...prod, DEV_TOOLS: "1" })).devTools).toBe(false);
  });

  it("boots with a complete configuration", async () => {
    await expect(load(prod)).resolves.toBeDefined();
  });

  it("refuses without a job secret: the tick could never run", async () => {
    await expect(load({ ...prod, CRON_SECRET: "" })).rejects.toThrow(/JOB_SECRET or CRON_SECRET/);
    await expect(load({ ...prod, CRON_SECRET: "", JOB_SECRET: "j" })).resolves.toBeDefined();
  });

  it("refuses Razorpay without its keys or webhook secret", async () => {
    await expect(load({ ...prod, RAZORPAY_KEY_SECRET: "" })).rejects.toThrow(/RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET/);
    await expect(load({ ...prod, RAZORPAY_WEBHOOK_SECRET: "" })).rejects.toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });
});
