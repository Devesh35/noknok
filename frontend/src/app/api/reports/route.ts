import type { NextRequest } from "next/server";
import { reportInput } from "@/lib/schemas";
import { report } from "@/server/activities";
import { requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => {
    const input = reportInput.parse(await readJson(request));
    await report(await requireUser(), input);
    return json(null);
  });
}
