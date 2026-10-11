import type { NextRequest } from "next/server";
import { quickPlanInput } from "@/lib/schemas";
import { createQuickPlan } from "@/server/activities";
import { requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => {
    const input = quickPlanInput.parse(await readJson(request));
    return json(await createQuickPlan(await requireUser(), input));
  });
}
