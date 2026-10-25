import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";

// The only reader of process.env (AGENTS-B rule 3). Validated once at boot.
// `public` values may also reach the browser (as NEXT_PUBLIC_*); `secret`
// values never do (PLATFORM_PLAN §9).

// Every NEXT_PUBLIC_ name the app knows. Anything else fails boot, so a secret
// can't be exposed by prefixing it by mistake.
const PUBLIC_NAMES = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY",
  "NEXT_PUBLIC_FIREBASE_TEST_MODE",
  "NEXT_PUBLIC_MAP_PROVIDER",
  "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
] as const;

// Vercel exposes its own system variables as NEXT_PUBLIC_VERCEL_*.
const unknownPublic = Object.keys(process.env).filter(
  (name) =>
    name.startsWith("NEXT_PUBLIC_") &&
    !name.startsWith("NEXT_PUBLIC_VERCEL_") &&
    !(PUBLIC_NAMES as readonly string[]).includes(name),
);
if (unknownPublic.length) {
  throw new Error(`Unknown public env names (not on the allow-list in config.ts): ${unknownPublic.join(", ")}`);
}

const optional = z.string().trim().min(1).optional();

const publicSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: optional,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optional,
  NEXT_PUBLIC_MAP_PROVIDER: z.enum(["osm", "google"]).default("osm"),
});

const secretSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Empty in development: an in-memory MongoDB is started instead.
  MONGODB_URI: optional,
  SESSION_COOKIE: z.string().default("nn_session"),
  APP_URL: z.url().default("http://localhost:3000"),
  JOB_SECRET: optional,
  // Vercel Cron sends this as `Authorization: Bearer`. Vercel sets it from the
  // project's environment variables.
  CRON_SECRET: optional,
  SIGNUP_TOKEN_SECRET: optional,
  // Firebase Auth (server). Base64 of the service-account JSON.
  FIREBASE_SERVICE_ACCOUNT_JSON: optional,
  FIREBASE_PROJECT_ID: optional,
  // Google Maps Platform (Places + Geocoding). Empty = Nominatim.
  GOOGLE_MAPS_SERVER_KEY: optional,
  // Payments
  PAYMENT_PROVIDER: z.enum(["fake", "razorpay"]).default("fake"),
  PAYMENT_ENV: z.enum(["test", "live"]).default("test"),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  // The /dev page and /api/dev/* (user switcher, clock, full database wipe).
  // Exactly "1" or "true"; anything else is off. Development without a
  // MONGODB_URI (in-memory database) turns it on by itself.
  DEV_TOOLS: z.enum(["1", "true", "0", "false"]).optional(),
});

function read<T extends z.ZodObject>(schema: T): z.infer<T> {
  const values = Object.fromEntries(Object.keys(schema.shape).map((name) => [name, process.env[name] || undefined]));
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);
  return parsed.data;
}

const pub = read(publicSchema);
const secret = read(secretSchema);
const isProd = secret.NODE_ENV === "production";

export const config = {
  ...secret,
  isProd,
  // Never in production. Outside it, on by default only when the database
  // is the throwaway in-memory one; a real MONGODB_URI (a shared dev or
  // staging Atlas cluster) needs DEV_TOOLS=1 to expose the wipe.
  devTools:
    !isProd &&
    (secret.DEV_TOOLS === undefined ? !secret.MONGODB_URI : secret.DEV_TOOLS === "1" || secret.DEV_TOOLS === "true"),
  mapProvider: pub.NEXT_PUBLIC_MAP_PROVIDER,
  // Phone login always talks to the real Firebase project; without a service
  // account the login route answers NOT_CONFIGURED.
  firebase: {
    projectId: secret.FIREBASE_PROJECT_ID ?? pub.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    serviceAccountJson: secret.FIREBASE_SERVICE_ACCOUNT_JSON,
  },
  // A random secret in development means signup tokens die with the server,
  // which is fine for a 15-minute token.
  signupTokenSecret: secret.SIGNUP_TOKEN_SECRET ?? randomBytes(32).toString("hex"),
};

// What production refuses to boot with. `next build` also runs with
// NODE_ENV=production but without the runtime secrets, so it is exempt.
if (isProd && process.env.NEXT_PHASE !== "phase-production-build") {
  const problems = [
    !config.MONGODB_URI && "MONGODB_URI is required",
    !config.FIREBASE_SERVICE_ACCOUNT_JSON && "FIREBASE_SERVICE_ACCOUNT_JSON is required",
    !config.SIGNUP_TOKEN_SECRET && "SIGNUP_TOKEN_SECRET is required",
    config.PAYMENT_PROVIDER === "fake" && "PAYMENT_PROVIDER=fake is not allowed",
    // Without one of these the job tick rejects every caller: holds never
    // expire, reminders never go out, missed webhooks are never polled.
    !config.JOB_SECRET && !config.CRON_SECRET && "JOB_SECRET or CRON_SECRET is required",
    config.PAYMENT_PROVIDER === "razorpay" &&
      !(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET) &&
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required",
    // Without it every webhook is dropped as unsigned, silently.
    config.PAYMENT_PROVIDER === "razorpay" && !config.RAZORPAY_WEBHOOK_SECRET && "RAZORPAY_WEBHOOK_SECRET is required",
  ].filter(Boolean);
  if (problems.length) throw new Error(`Refusing to start in production: ${problems.join("; ")}`);
}
