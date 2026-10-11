// The browser's Firebase app, for phone sign-in only (PLATFORM_PLAN P1/P2).
// The only place the Firebase web config is read (PLATFORM_PLAN §9). These
// values are public by design; the console restricts what they can do.
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

// Next inlines NEXT_PUBLIC_* only for literal property reads, so each is spelled out.
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const EMULATOR_FLAG = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR;
const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;

// Same rule as src/server/config.ts: the flag wins; otherwise the emulator is
// used outside production when no project is configured.
export const USES_EMULATOR =
  EMULATOR_FLAG !== undefined && EMULATOR_FLAG !== ""
    ? EMULATOR_FLAG === "1"
    : !API_KEY && process.env.NODE_ENV !== "production";

export const EMULATOR_URL = "http://127.0.0.1:9099";
export const FIREBASE_PROJECT_ID = PROJECT_ID || (USES_EMULATOR ? "demo-noknok" : "");

export function firebaseConfigured(): boolean {
  return USES_EMULATOR || !!API_KEY;
}

let auth: Auth | null = null;

function app(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  const created = initializeApp({
    // The emulator accepts any key for a "demo-" project.
    apiKey: API_KEY || "demo-key",
    authDomain: AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    appId: APP_ID,
  });
  // App Check: only our pages may start a phone sign-in (needs the site key).
  if (!USES_EMULATOR && APP_CHECK_SITE_KEY) {
    initializeAppCheck(created, {
      provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return created;
}

export function firebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(app());
  auth.languageCode = "en";
  if (USES_EMULATOR) {
    connectAuthEmulator(auth, EMULATOR_URL, { disableWarnings: true });
    // The emulator doesn't check reCAPTCHA; skip loading it.
    auth.settings.appVerificationDisabledForTesting = true;
  }
  return auth;
}
