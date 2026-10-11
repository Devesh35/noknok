import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { removeFriendship } from "@/server/friends";
import { handle, json } from "@/server/respond";

export function DELETE(_request: NextRequest, ctx: RouteContext<"/api/friends/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await removeFriendship(await requireUser(), id);
    return json(null);
  });
}
