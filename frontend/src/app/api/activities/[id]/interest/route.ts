import type { NextRequest } from "next/server";
import { toggleInterested } from "@/server/activities";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";

export function POST(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/interest">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json({ interested: await toggleInterested(await requireUser(), id) });
  });
}
