// Phone sign-in through Firebase, used only to prove the number. The ID token
// is exchanged for our own session cookie and the browser signs straight out
// of Firebase (AGENTS-B rule 18): nothing else may read Firebase user state.
import { FirebaseError } from "firebase/app";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from "firebase/auth";
import type { ErrorCode } from "@/lib/errors";
import { firebaseAuth } from "@/lib/firebase/client";

export class PhoneAuthError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, [ErrorCode, string]> = {
  "auth/invalid-phone-number": ["INVALID", "That number doesn't look right"],
  "auth/missing-phone-number": ["INVALID", "Enter your phone number"],
  "auth/too-many-requests": ["RATE_LIMITED", "Too many attempts. Wait a while and try again."],
  "auth/quota-exceeded": ["RATE_LIMITED", "We can't send more codes right now. Try again later."],
  "auth/invalid-verification-code": ["OTP_INVALID", "That code isn't right"],
  "auth/code-expired": ["OTP_EXPIRED", "That code has expired. Send a new one."],
  "auth/session-expired": ["OTP_EXPIRED", "That code has expired. Send a new one."],
  "auth/missing-verification-id": ["OTP_EXPIRED", "Send a new code to continue."],
  "auth/network-request-failed": ["NETWORK", "Can't reach the sign-in service. Check your connection."],
  "auth/captcha-check-failed": ["FORBIDDEN", "We couldn't check you're human. Reload and try again."],
  "auth/invalid-app-credential": ["FORBIDDEN", "We couldn't check you're human. Reload and try again."],
  "auth/operation-not-allowed": ["NOT_CONFIGURED", "Phone login isn't switched on yet."],
  "auth/configuration-not-found": ["NOT_CONFIGURED", "Phone login isn't switched on yet."],
};

function explain(error: unknown): PhoneAuthError {
  if (error instanceof PhoneAuthError) return error;
  const code = error instanceof FirebaseError ? error.code : "";
  if (process.env.NODE_ENV !== "production") console.error("[phone-auth]", code, error);
  const [errorCode, message] = MESSAGES[code] ?? ["SERVER", "Couldn't sign you in. Try again."];
  return new PhoneAuthError(errorCode, message);
}

let verifier: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;

// Texts a code to +91<phone>. `containerId` is an always-mounted element the
// invisible reCAPTCHA attaches to. Throws PhoneAuthError.
export async function sendCode(phone: string, containerId: string): Promise<void> {
  const auth = firebaseAuth();
  // A fresh verifier per send: the old one may be bound to an element React
  // has since replaced, and a used one can't be reset reliably.
  verifier?.clear();
  // The widget refuses to render twice into one element, so each send gets a new child.
  const host = document.getElementById(containerId);
  if (!host) throw new PhoneAuthError("SERVER", "Couldn't sign you in. Try again.");
  host.replaceChildren();
  const slot = document.createElement("div");
  host.appendChild(slot);
  verifier = new RecaptchaVerifier(auth, slot, { size: "invisible" });
  try {
    confirmation = await signInWithPhoneNumber(auth, `+91${phone}`, verifier);
  } catch (error) {
    verifier.clear();
    verifier = null;
    throw explain(error);
  }
}

// Checks the code and returns the one-time ID token for POST /api/auth/firebase.
export async function confirmCode(code: string): Promise<string> {
  if (!confirmation) throw new PhoneAuthError("OTP_EXPIRED", "Send a new code to continue.");
  try {
    const credential = await confirmation.confirm(code);
    return await credential.user.getIdToken();
  } catch (error) {
    throw explain(error);
  }
}

// After the exchange (successful or not): the cookie is the only login state.
export async function forgetFirebaseSignIn(): Promise<void> {
  confirmation = null;
  try {
    await signOut(firebaseAuth());
  } catch {
    // Nothing to sign out of.
  }
}
