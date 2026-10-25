import type { NextRequest } from "next/server";
import { setInterested } from "@/server/activities";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";

// POST marks interest, DELETE clears it; both are safe to repeat.
export function POST(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/interest">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json({ interested: await setInterested(await requireUser(), id, true) });
  });
}

export function DELETE(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/interest">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json({ interested: await setInterested(await requireUser(), id, false) });
  });
}
