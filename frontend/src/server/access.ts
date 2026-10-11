import "server-only";
import { canSee, type FriendGraph } from "@/lib/visibility";
import { viewerKey } from "@/server/auth";
import { connectDb } from "@/server/db";
import { graphFor } from "@/server/friends";
import { InviteOpenModel, JoinModel, type ActivityDoc, type UserDoc } from "@/server/models";

export const LIVE_STATUSES = ["pending_payment", "going", "waitlisted"] as const;

// Everything a viewer's access to a batch of activities depends on, loaded in
// a few batched queries so lists don't fan out per item.
export interface ViewerAccess {
  userId: string | null;
  graph: FriendGraph;
  invited: Set<string>; // activity ids an invite link opened by this viewer unlocks
  going: Set<string>; // activity ids the viewer holds a going ticket for
}

export async function accessFor(
  viewer: UserDoc | null,
  activities: Pick<ActivityDoc, "_id" | "hostId">[],
): Promise<ViewerAccess> {
  await connectDb();
  const ids = activities.map((a) => a._id);
  const key = await viewerKey();
  const [graph, invites, joins] = await Promise.all([
    graphFor([viewer?._id, ...activities.map((a) => a.hostId)]),
    ids.length
      ? InviteOpenModel.find({ viewerKey: key, activityId: { $in: ids }, grantsAccess: true }).lean()
      : [],
    viewer && ids.length
      ? JoinModel.find({ userId: viewer._id, activityId: { $in: ids }, status: "going" }).lean()
      : [],
  ]);
  return {
    userId: viewer?._id ?? null,
    graph,
    invited: new Set(invites.map((i) => i.activityId)),
    going: new Set(joins.map((j) => j.activityId)),
  };
}

export function canView(access: ViewerAccess, activity: Pick<ActivityDoc, "_id" | "hostId" | "visibility">): boolean {
  const unlocked = access.invited.has(activity._id) || access.going.has(activity._id);
  return canSee(access.userId, activity, access.graph, unlocked);
}

export async function canViewActivity(viewer: UserDoc | null, activity: ActivityDoc): Promise<boolean> {
  return canView(await accessFor(viewer, [activity]), activity);
}
