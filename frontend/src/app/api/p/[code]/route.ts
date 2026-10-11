import type { NextRequest } from "next/server";
import { activityByCode } from "@/server/activities";
import { handle, json } from "@/server/respond";

export function GET(_request: NextRequest, ctx: RouteContext<"/api/p/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    return json({ activityId: await activityByCode(code) });
  });
}
