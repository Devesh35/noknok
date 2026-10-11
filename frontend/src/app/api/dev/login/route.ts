import type { NextRequest } from "next/server";
import { z } from "zod";
import { devLogin } from "@/server/dev";
import { handle, json, readJson } from "@/server/respond";

const input = z.object({ userId: z.string().min(1) });

export function POST(request: NextRequest) {
  return handle(async () => {
    const { userId } = input.parse(await readJson(request));
    await devLogin(userId);
    return json(null);
  });
}
