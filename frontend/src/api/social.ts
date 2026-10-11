"use client";

import { apiFetch, safe } from "@/lib/api/client";
import { invalidateAll } from "@/lib/api/query";
import type { Result } from "@/lib/errors";
import type { FriendRequest } from "@/lib/types";

// Sends a request, or accepts one the other person already sent.
export async function sendFriendRequest(toId: string): Promise<Result<FriendRequest>> {
  const result = await safe<FriendRequest>(
    apiFetch("/friends/requests", { method: "POST", body: { toId } }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

export async function acceptFriendRequest(requestId: string): Promise<Result<FriendRequest>> {
  const result = await safe<FriendRequest>(
    apiFetch(`/friends/requests/${requestId}/accept`, { method: "POST" }),
  );
  if (result.ok) await invalidateAll();
  return result;
}

// Declines or withdraws a pending request, or unfriends.
export async function removeFriendship(otherId: string): Promise<Result<null>> {
  const result = await safe<null>(apiFetch(`/friends/${otherId}`, { method: "DELETE" }));
  if (result.ok) await invalidateAll();
  return result;
}
