import type { NextRequest } from "next/server";
import { reviewInput } from "@/lib/schemas";
import { addReview } from "@/server/activities";
import { requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest, ctx: RouteContext<"/api/activities/[id]/reviews">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const input = reviewInput.parse(await readJson(request));
    await addReview(await requireUser(), id, input);
    return json(null);
  });
}
