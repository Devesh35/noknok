// The browser's Firebase app, for phone sign-in only (PLATFORM_PLAN P1/P2).
// The only place the Firebase web config is read (PLATFORM_PLAN §9). These
// values are public by design; the console restricts what they can do.
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";

// Next inlines NEXT_PUBLIC_* only for literal property reads, so each is spelled out.
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;

// Development only: skips reCAPTCHA and App Check. Firebase then accepts only
// the console's "Phone numbers for testing" with their fixed codes.
const TEST_MODE =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_TEST_MODE === "1";

export function firebaseConfigured(): boolean {
  return !!API_KEY;
}

let auth: Auth | null = null;

function app(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  const created = initializeApp({
    apiKey: API_KEY,
    authDomain: AUTH_DOMAIN,
    projectId: PROJECT_ID,
    appId: APP_ID,
  });
  // App Check: only our pages may start a phone sign-in (needs the site key).
  if (APP_CHECK_SITE_KEY && !TEST_MODE) {
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
  if (TEST_MODE) auth.settings.appVerificationDisabledForTesting = true;
  return auth;
}
