import type { NextRequest } from "next/server";
import { settingsPatch } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";
import { updateSettings } from "@/server/users";

export function PATCH(request: NextRequest) {
  return handle(async () => {
    const patch = settingsPatch.parse(await readJson(request));
    return json(await updateSettings(await requireUser(), patch));
  });
}
