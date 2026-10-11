import type { NextRequest } from "next/server";
import { inviteOpenInput } from "@/lib/schemas";
import { openInvite } from "@/server/activities";
import { currentUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest, ctx: RouteContext<"/api/activities/[id]/invite/open">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { token, refId } = inviteOpenInput.parse(await readJson(request));
    await openInvite(await currentUser(), id, token, refId);
    return json(null);
  });
}
