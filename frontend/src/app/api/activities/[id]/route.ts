import type { NextRequest } from "next/server";
import { activityInput } from "@/lib/schemas";
import { cancelActivity, updateActivity } from "@/server/activities";
import { activityDetail } from "@/server/activities.detail";
import { currentUser, requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";

type Ctx = RouteContext<"/api/activities/[id]">;

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return json(await activityDetail(id, await currentUser()));
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const input = activityInput.parse(await readJson(request));
    return json(await updateActivity(await requireUser(), id, input));
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    await cancelActivity(await requireUser(), id);
    return json(null);
  });
}
