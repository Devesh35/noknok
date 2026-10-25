import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { removeAttendee } from "@/server/joins";
import { handle, json } from "@/server/respond";

// The host takes someone off the plan; they are refunded in full.
export function DELETE(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/attendees/[userId]">) {
  return handle(async () => {
    const { id, userId } = await ctx.params;
    await removeAttendee(await requireUser(), id, userId);
    return json(null);
  });
}
