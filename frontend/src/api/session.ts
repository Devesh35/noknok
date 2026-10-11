"use client";

import { useEffect } from "react";
import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll, useApi } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import { confirmCode, emulatorCodeFor, forgetFirebaseSignIn, PhoneAuthError, sendCode } from "@/lib/firebase/auth";
import type { RegisterInput } from "@/lib/schemas";
import { setTimeOffset } from "@/lib/time";
import type { Me, SessionDto } from "@/lib/types";

const CITY_KEY = "noknok.city";

// Who is logged in, plus the few app-wide bits every screen needs.
// `data` is undefined while loading.
export function useSession() {
  const query = useApi<SessionDto>("/me");
  const offset = query.data?.dev.timeOffsetMs;
  // The /dev page can fast-forward the clock; keep this tab's clock in step.
  useEffect(() => {
    if (offset !== undefined) setTimeOffset(offset);
  }, [offset]);
  return query;
}

export function useMe(): { me: Me | null | undefined; loaded: boolean } {
  const { data } = useSession();
  return { me: data === undefined ? undefined : data.user, loaded: data !== undefined };
}

// The city shown on Home is a device preference, not account data.
export function getPreferredCity(): string | null {
  try {
    return window.localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

export function setPreferredCity(city: string) {
  try {
    window.localStorage.setItem(CITY_KEY, city);
  } catch {
    // Private mode: the choice just doesn't stick.
  }
}

function phoneAuthFailure(error: unknown): Extract<Result<never>, { ok: false }> {
  if (error instanceof PhoneAuthError) return { ok: false, code: error.code, message: error.message };
  return { ok: false, code: "SERVER", message: "Couldn't sign you in. Try again." };
}

// Texts a login code (through Firebase). `containerId` is an always-mounted
// element for the invisible reCAPTCHA. In development the emulator keeps the
// code instead of texting it; `devCode` hands it to the screen.
export async function sendLoginCode(
  phone: string,
  containerId: string,
): Promise<Result<{ devCode: string | null }>> {
  try {
    await sendCode(phone, containerId);
    return { ok: true, data: { devCode: await emulatorCodeFor(phone) } };
  } catch (error) {
    return phoneAuthFailure(error);
  }
}

// Checks the code with Firebase, then trades the proof for our session cookie.
// `registered` false means the number is new: finish with registerUser().
export async function verifyLoginCode(
  code: string,
): Promise<Result<{ registered: true } | { registered: false; signupToken: string }>> {
  let idToken: string;
  try {
    idToken = await confirmCode(code);
  } catch (error) {
    return phoneAuthFailure(error);
  }
  const result = await safe<{ registered: true } | { registered: false; signupToken: string }>(
    apiFetch("/auth/firebase", { method: "POST", body: { idToken } }),
  );
  await forgetFirebaseSignIn();
  if (result.ok && result.data.registered) await invalidateAll();
  return result;
}

export async function registerUser(input: RegisterInput): Promise<Result<Me>> {
  const result = await safe<Me>(apiFetch("/users", { method: "POST", body: input }));
  if (result.ok) await invalidateAll();
  return result;
}

export async function logOut(): Promise<Result<null>> {
  const result = await safe<null>(apiFetch("/auth/logout", { method: "POST" }));
  await invalidateAll();
  return result;
}

export async function deleteAccount(): Promise<Result<null>> {
  const result = await safe<null>(apiFetch("/me", { method: "DELETE" }));
  await invalidateAll();
  return result;
}
