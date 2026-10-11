import type { NextRequest } from "next/server";
import { z } from "zod";
import { endActivityNow } from "@/server/dev";
import { handle, json, readJson } from "@/server/respond";

const input = z.object({ id: z.string().min(1) });

export function POST(request: NextRequest) {
  return handle(async () => {
    await endActivityNow(input.parse(await readJson(request)).id);
    return json(null);
  });
}
