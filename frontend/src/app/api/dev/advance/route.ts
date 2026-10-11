import type { NextRequest } from "next/server";
import { z } from "zod";
import { advanceTime } from "@/server/dev";
import { handle, json, readJson } from "@/server/respond";

const input = z.object({ ms: z.number().int() });

export function POST(request: NextRequest) {
  return handle(async () => json(await advanceTime(input.parse(await readJson(request)).ms)));
}
