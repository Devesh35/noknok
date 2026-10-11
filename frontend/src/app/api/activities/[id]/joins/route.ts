import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { leaveActivity, requestJoin } from "@/server/joins";
import { handle, json } from "@/server/respond";

// One path, two verbs (PLATFORM_PLAN P8): POST asks for a spot, DELETE gives
// up the caller's live join (refunded before the cutoff).
export function POST(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/joins">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await requestJoin(await requireUser(), id));
  });
}

export function DELETE(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/joins">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json({ refundedP: await leaveActivity(await requireUser(), id) });
  });
}
