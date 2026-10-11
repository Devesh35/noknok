import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { markRead } from "@/server/notify";
import { handle, json } from "@/server/respond";

export function POST(_request: NextRequest, ctx: RouteContext<"/api/notifications/[id]/read">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await markRead((await requireUser())._id, id);
    return json(null);
  });
}
