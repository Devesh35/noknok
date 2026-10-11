import type { NextRequest } from "next/server";
import { checkInInput } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { checkIn } from "@/server/joins";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest, ctx: RouteContext<"/api/activities/[id]/check-in">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { ticketId } = checkInInput.parse(await readJson(request));
    return json({ result: await checkIn(await requireUser(), id, ticketId) });
  });
}
