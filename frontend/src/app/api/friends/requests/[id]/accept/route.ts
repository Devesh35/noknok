import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { acceptFriendRequest } from "@/server/friends";
import { handle, json } from "@/server/respond";

export function POST(_request: NextRequest, ctx: RouteContext<"/api/friends/requests/[id]/accept">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await acceptFriendRequest(await requireUser(), id));
  });
}
