import type { NextRequest } from "next/server";
import { hostManage } from "@/server/activities.host";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";

export function GET(_request: NextRequest, ctx: RouteContext<"/api/host/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await hostManage(await requireUser(), id));
  });
}
