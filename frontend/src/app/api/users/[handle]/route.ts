import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { handle, json } from "@/server/respond";
import { profileFor } from "@/server/users.profile";

export function GET(_request: NextRequest, ctx: RouteContext<"/api/users/[handle]">) {
  return handle(async () => {
    const { handle: handleName } = await ctx.params;
    return json(await profileFor(handleName, await currentUser()));
  });
}
