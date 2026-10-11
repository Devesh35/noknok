"use client";

// The hidden /dev page. These endpoints only exist outside production.
import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll, useApi } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import type { DevDto, DevSettings } from "@/lib/types";

export function useDev() {
  return useApi<DevDto>("/dev");
}

async function post<T>(path: string, body?: unknown): Promise<Result<T>> {
  const result = await safe<T>(apiFetch(path, { method: "POST", body }));
  await invalidateAll();
  return result;
}

export function devLogIn(userId: string) {
  return post<null>("/dev/login", { userId });
}

export function updateDev(patch: Partial<DevSettings>) {
  return post<DevSettings>("/dev/settings", patch);
}

export function advanceTime(ms: number) {
  return post<DevSettings>("/dev/advance", { ms });
}

// Moves an activity into the past so reviews and payouts can be demoed.
export function endActivityNow(id: string) {
  return post<null>("/dev/end", { id });
}

export function resetDemo() {
  return post<null>("/dev/reset");
}
