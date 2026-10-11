"use client";

import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll, useApi } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import type { ProfilePatch, SettingsPatch } from "@/lib/schemas";
import type { AppNotification, Me, PersonResult, ProfileDto, User } from "@/lib/types";

export type { ProfilePatch, SettingsPatch };

// "me" for the viewer's own profile. 404 -> NOT_FOUND, anonymous "me" -> NOT_LOGGED_IN.
export function useProfile(handle: string) {
  return useApi<ProfileDto>(`/users/${encodeURIComponent(handle)}`);
}

// People search for Home. Empty query returns nothing.
export function usePeople(q: string) {
  return useApi<{ items: PersonResult[] }>("/users", { q }, { enabled: q.trim().length > 0 });
}

export function useBlockedUsers(enabled = true) {
  return useApi<{ items: User[] }>("/me/blocked", undefined, { enabled });
}

export function useNotifications(enabled = true) {
  return useApi<{ items: AppNotification[] }>("/notifications", undefined, { enabled });
}

export async function isHandleAvailable(handle: string): Promise<boolean> {
  const result = await safe<{ available: boolean }>(
    apiFetch("/users/handle-available", { query: { handle } }),
  );
  return result.ok ? result.data.available : false;
}

export async function updateProfile(patch: ProfilePatch): Promise<Result<Me>> {
  const result = await safe<Me>(apiFetch("/me", { method: "PATCH", body: patch }));
  if (result.ok) await invalidateAll();
  return result;
}

export async function updateSettings(patch: SettingsPatch): Promise<Result<Me>> {
  const result = await safe<Me>(apiFetch("/me/settings", { method: "PATCH", body: patch }));
  if (result.ok) await invalidateAll();
  return result;
}

// Returns whether the user is now blocked.
export async function toggleBlock(userId: string): Promise<Result<{ blocked: boolean }>> {
  const result = await safe<{ blocked: boolean }>(
    apiFetch(`/users/${userId}/block`, { method: "POST" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

export async function markNotificationRead(id: string): Promise<Result<null>> {
  const result = await safe<null>(apiFetch(`/notifications/${id}/read`, { method: "POST" }));
  if (result.ok) await invalidateAll();
  return result;
}

export async function markAllNotificationsRead(): Promise<Result<null>> {
  const result = await safe<null>(apiFetch("/notifications/read-all", { method: "POST" }));
  if (result.ok) await invalidateAll();
  return result;
}
