import type { NextRequest } from "next/server";
import { z } from "zod";
import { reversePlace } from "@/server/geo";
import { clientIp } from "@/server/ratelimit";
import { handle, json, readQuery } from "@/server/respond";

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export function GET(request: NextRequest) {
  return handle(async () => {
    const { lat, lng } = query.parse(readQuery(request));
    return json({ place: await reversePlace(lat, lng, clientIp(request)) });
  });
}
