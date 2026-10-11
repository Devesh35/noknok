import type { NextRequest } from "next/server";
import { z } from "zod";
import { searchPlaces } from "@/server/geo";
import { clientIp } from "@/server/ratelimit";
import { handle, json, readQuery } from "@/server/respond";

const query = z.object({ q: z.string().trim().min(2).max(120) });

export function GET(request: NextRequest) {
  return handle(async () => {
    const { q } = query.parse(readQuery(request));
    return json({ items: await searchPlaces(q, clientIp(request)) });
  });
}
