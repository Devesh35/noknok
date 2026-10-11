import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";
import { toggleBlock } from "@/server/users";

// The segment is a user id here; it shares the folder with /users/[handle]
// because Next requires one slug name per path position.
export function POST(_request: NextRequest, ctx: RouteContext<"/api/users/[handle]/block">) {
  return handle(async () => {
    const { handle: id } = await ctx.params;
    return json({ blocked: await toggleBlock(await requireUser(), id) });
  });
}
