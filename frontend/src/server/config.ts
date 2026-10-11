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
  "NEXT_PUBLIC_FIREBASE_USE_EMULATOR",
  "NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY",
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
  NEXT_PUBLIC_FIREBASE_USE_EMULATOR: z.enum(["0", "1"]).optional(),
  NEXT_PUBLIC_MAP_PROVIDER: z.enum(["osm", "google"]).default("osm"),
});

const secretSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Empty in development: an in-memory MongoDB is started instead.
  MONGODB_URI: optional,
  SESSION_COOKIE: z.string().default("nn_session"),
  APP_URL: z.url().default("http://localhost:3000"),
  JOB_SECRET: optional,
  SIGNUP_TOKEN_SECRET: optional,
  // Firebase Auth (server). Base64 of the service-account JSON.
  FIREBASE_SERVICE_ACCOUNT_JSON: optional,
  FIREBASE_PROJECT_ID: optional,
  FIREBASE_AUTH_EMULATOR_HOST: optional,
  // Google Maps Platform (Places + Geocoding). Empty = Nominatim.
  GOOGLE_MAPS_SERVER_KEY: optional,
  // Payments
  PAYMENT_PROVIDER: z.enum(["fake", "razorpay", "phonepe"]).default("fake"),
  PAYMENT_ENV: z.enum(["test", "live"]).default("test"),
  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  PHONEPE_CLIENT_ID: optional,
  PHONEPE_CLIENT_SECRET: optional,
  PHONEPE_CLIENT_VERSION: z.string().default("1"),
  PHONEPE_WEBHOOK_USERNAME: optional,
  PHONEPE_WEBHOOK_PASSWORD: optional,
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

// Same rule the browser applies in src/lib/firebase/client.ts: an explicit
// flag wins; otherwise the emulator is used outside production when no
// Firebase project is configured.
const useAuthEmulator =
  pub.NEXT_PUBLIC_FIREBASE_USE_EMULATOR !== undefined
    ? pub.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === "1"
    : !isProd && !pub.NEXT_PUBLIC_FIREBASE_API_KEY;

// firebase-admin finds the emulator through this variable. `firebase
// emulators:exec` sets it; `npm run dev` (concurrently) does not.
const authEmulatorHost = useAuthEmulator ? (secret.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099") : undefined;
if (authEmulatorHost) process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;

export const config = {
  ...secret,
  isProd,
  mapProvider: pub.NEXT_PUBLIC_MAP_PROVIDER,
  firebase: {
    useEmulator: useAuthEmulator,
    emulatorHost: authEmulatorHost,
    // The emulator accepts any "demo-" project id without a real project.
    projectId:
      secret.FIREBASE_PROJECT_ID ?? pub.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? (useAuthEmulator ? "demo-noknok" : undefined),
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
    useAuthEmulator && "the Firebase Auth emulator is on (NEXT_PUBLIC_FIREBASE_USE_EMULATOR)",
    !config.FIREBASE_SERVICE_ACCOUNT_JSON && "FIREBASE_SERVICE_ACCOUNT_JSON is required",
    !config.SIGNUP_TOKEN_SECRET && "SIGNUP_TOKEN_SECRET is required",
    config.PAYMENT_PROVIDER === "fake" && "PAYMENT_PROVIDER=fake is not allowed",
  ].filter(Boolean);
  if (problems.length) throw new Error(`Refusing to start in production: ${problems.join("; ")}`);
}
