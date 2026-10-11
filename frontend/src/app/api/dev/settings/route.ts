import type { NextRequest } from "next/server";
import { devSettingsPatch } from "@/lib/schemas";
import { updateDev } from "@/server/dev";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => json(await updateDev(devSettingsPatch.parse(await readJson(request)))));
}
