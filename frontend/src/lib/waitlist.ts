import type { Activity, Join } from "@/lib/types";

type JoinLike = Pick<Join, "id" | "activityId" | "status" | "createdAt">;

export function goingCount(joins: JoinLike[], activityId: string): number {
  return joins.filter((j) => j.activityId === activityId && j.status === "going").length;
}

// Waitlisted joins for an activity, first come first served.
export function waitlistOf<T extends JoinLike>(joins: T[], activityId: string): T[] {
  return joins
    .filter((j) => j.activityId === activityId && j.status === "waitlisted")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// 1-based place in the queue, or 0 if the join is not waitlisted.
export function waitlistPosition(joins: JoinLike[], joinId: string): number {
  const join = joins.find((j) => j.id === joinId);
  if (!join) return 0;
  return waitlistOf(joins, join.activityId).findIndex((j) => j.id === joinId) + 1;
}

// Ids of waitlisted joins that should be given a spot now. In "approval" mode
// nobody is promoted automatically; the host picks.
export function joinsToPromote(
  joins: JoinLike[],
  activity: Pick<Activity, "id" | "capacity" | "waitlistMode" | "status">,
): string[] {
  if (activity.status !== "active" || activity.waitlistMode !== "auto") return [];
  const free = activity.capacity - goingCount(joins, activity.id);
  if (free <= 0) return [];
  return waitlistOf(joins, activity.id)
    .slice(0, free)
    .map((j) => j.id);
}
