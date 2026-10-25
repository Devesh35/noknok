import type { NextRequest } from "next/server";
import { z } from "zod";
import { GOOGLE_MAPS } from "@/lib/maps/provider";
import { config } from "@/server/config";
import { fail, handle } from "@/server/respond";

// A still picture of a venue for the plan page, so the interactive map (and
// its per-load billing) only runs when someone taps it. Google's Static Maps
// is fetched once per venue and then served from the CDN for a year; the
// coordinates are rounded so near-identical pins share a cache entry.
const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  w: z.coerce.number().int().min(100).max(640).default(640),
  h: z.coerce.number().int().min(100).max(640).default(360),
});

const ONE_YEAR = 60 * 60 * 24 * 365;

function withKey(url: URL, key: string): URL {
  const copy = new URL(url);
  copy.searchParams.set("key", key);
  return copy;
}

export function GET(request: NextRequest) {
  return handle(async () => {
    // The server key when it has the Maps Static API; otherwise the browser
    // key, whose referrer restriction is satisfied by naming our own origin.
    const serverKey = config.GOOGLE_MAPS_SERVER_KEY;
    const key = serverKey || GOOGLE_MAPS.key;
    if (!key) fail("NOT_FOUND", "Static maps are not configured");
    const { lat, lng, w, h } = query.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const at = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
    url.searchParams.set("center", at);
    url.searchParams.set("zoom", "15");
    url.searchParams.set("size", `${w}x${h}`);
    url.searchParams.set("scale", "2");
    url.searchParams.set("markers", `color:0x7f4ff0|${at}`);
    url.searchParams.set("region", "IN");
    const fetchWith = (k: string) =>
      fetch(withKey(url, k), {
        headers:
          serverKey && k === serverKey ? {} : { referer: `${config.APP_URL}/` },
        next: { revalidate: ONE_YEAR },
      });
    let upstream = await fetchWith(key);
    // A server key without this API answers 403; try the browser key then.
    if (!upstream.ok && serverKey && GOOGLE_MAPS.key)
      upstream = await fetchWith(GOOGLE_MAPS.key);
    if (!upstream.ok) fail("SERVER", "Map image unavailable");
    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "cache-control": `public, max-age=86400, s-maxage=${ONE_YEAR}, immutable`,
      },
    });
  });
}
