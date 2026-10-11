import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { joinWaitlist } from "@/server/joins";
import { handle, json } from "@/server/respond";

export function POST(_request: NextRequest, ctx: RouteContext<"/api/activities/[id]/waitlist">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await joinWaitlist(await requireUser(), id));
  });
}
