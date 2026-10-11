import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { approveWaitlist } from "@/server/joins";
import { handle, json } from "@/server/respond";

export function POST(_request: NextRequest, ctx: RouteContext<"/api/joins/[id]/approve">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json({ approved: await approveWaitlist(await requireUser(), id) });
  });
}
