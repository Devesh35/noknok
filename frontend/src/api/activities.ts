"use client";

import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll, useApi } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import type { ActivityInput, ActivityListQuery, QuickPlanInput } from "@/lib/schemas";
import type {
  Activity,
  ActivityCardItem,
  ActivityDetail,
  Category,
  HostHubDto,
  HostManageDto,
} from "@/lib/types";

export type { ActivityInput, ActivityListQuery, QuickPlanInput };

// Discover list. Filters are applied on the server; `locked` items are the
// ones the viewer can't open and are included only with includeLocked.
// `categories` are the ones with plans under the other filters.
export function useActivities(query: Partial<ActivityListQuery>, keepPrevious = false) {
  return useApi<{ items: ActivityCardItem[]; categories: Category[] }>("/activities", query, {
    keepPrevious,
  });
}

export function useActivity(id: string | null) {
  return useApi<ActivityDetail>(id ? `/activities/${id}` : null);
}

// /p/:code -> activity id
export function useShortCode(code: string) {
  return useApi<{ activityId: string }>(`/p/${encodeURIComponent(code)}`);
}

export function useHostHub(enabled = true) {
  return useApi<HostHubDto>("/host", undefined, { enabled });
}

export function useHostManage(id: string) {
  return useApi<HostManageDto>(`/host/${id}`);
}

export async function createActivity(input: ActivityInput): Promise<Result<Activity>> {
  const result = await safe<Activity>(apiFetch("/activities", { method: "POST", body: input }));
  if (result.ok) await invalidateAll();
  return result;
}

export async function updateActivity(id: string, input: ActivityInput): Promise<Result<Activity>> {
  const result = await safe<Activity>(
    apiFetch(`/activities/${id}`, { method: "PATCH", body: input }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Cancels the activity and refunds everyone in full.
export async function cancelActivity(id: string): Promise<Result<null>> {
  const result = await safe<null>(apiFetch(`/activities/${id}`, { method: "DELETE" }));
  if (result.ok) await invalidateAll();
  return result;
}

// "Quick plan": a free, open activity made from four answers.
export async function createQuickPlan(input: QuickPlanInput): Promise<Result<Activity>> {
  const result = await safe<Activity>(
    apiFetch("/activities/quick", { method: "POST", body: input }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Sets (or clears) interest. Idempotent: a retried tap can't flip it back.
export async function setInterested(
  activityId: string,
  interested: boolean,
): Promise<Result<{ interested: boolean }>> {
  const result = await safe<{ interested: boolean }>(
    apiFetch(`/activities/${activityId}/interest`, { method: interested ? "POST" : "DELETE" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Records that the viewer opened a link with ?invite= and/or ?ref=.
export async function openInvite(
  activityId: string,
  token: string | null,
  refId: string | null,
): Promise<Result<null>> {
  const result = await safe<null>(
    apiFetch(`/activities/${activityId}/invite/open`, { method: "POST", body: { token, refId } }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

export async function addReview(
  activityId: string,
  rating: number,
  tags: string[],
): Promise<Result<null>> {
  const result = await safe<null>(
    apiFetch(`/activities/${activityId}/reviews`, { method: "POST", body: { rating, tags } }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

export async function report(
  targetType: "activity" | "user",
  targetId: string,
  reason: string,
): Promise<Result<null>> {
  return safe<null>(apiFetch("/reports", { method: "POST", body: { targetType, targetId, reason } }));
}
