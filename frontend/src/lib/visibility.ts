import type { Activity, FriendRequest } from "@/lib/types";

// userId -> ids of their friends. Only accepted requests count.
export type FriendGraph = Map<string, Set<string>>;

export function buildGraph(requests: FriendRequest[]): FriendGraph {
  const graph: FriendGraph = new Map();
  const link = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a)!.add(b);
  };
  for (const request of requests) {
    if (request.status !== "accepted") continue;
    link(request.fromId, request.toId);
    link(request.toId, request.fromId);
  }
  return graph;
}

export function friendIds(graph: FriendGraph, userId: string): string[] {
  return [...(graph.get(userId) ?? [])];
}

export function isFriend(graph: FriendGraph, a: string, b: string): boolean {
  return graph.get(a)?.has(b) ?? false;
}

export function mutualFriendIds(graph: FriendGraph, a: string, b: string): string[] {
  const theirs = graph.get(b);
  if (!theirs) return [];
  return friendIds(graph, a).filter((id) => theirs.has(id));
}

// Whether a viewer may see an activity's details and join it.
//   open                -> anyone
//   friends             -> friends of the host
//   friends_of_friends  -> friends, or anyone sharing a friend with the host
// The host always sees their own activity, and an invite link grants access.
export function canSee(
  viewerId: string | null,
  activity: Pick<Activity, "hostId" | "visibility">,
  graph: FriendGraph,
  hasInvite = false,
): boolean {
  if (activity.visibility === "open" || hasInvite) return true;
  if (!viewerId) return false;
  if (viewerId === activity.hostId) return true;
  if (isFriend(graph, viewerId, activity.hostId)) return true;
  return (
    activity.visibility === "friends_of_friends" &&
    mutualFriendIds(graph, viewerId, activity.hostId).length > 0
  );
}
