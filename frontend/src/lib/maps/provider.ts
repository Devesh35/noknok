// Which map the browser draws (PLATFORM_PLAN P5). Google only when it's asked
// for and a browser key exists, so `npm run dev` without keys keeps working
// on OpenStreetMap. These values are public by design: the browser key is
// restricted to the Maps JavaScript API and our referrers.

export type MapProvider = "osm" | "google";

// Next inlines NEXT_PUBLIC_* only for literal property reads.
const PROVIDER = process.env.NEXT_PUBLIC_MAP_PROVIDER;
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

export function readProvider(): MapProvider {
  return PROVIDER === "google" && BROWSER_KEY ? "google" : "osm";
}

export const GOOGLE_MAPS = {
  key: BROWSER_KEY ?? "",
  // Advanced Markers need a map id; Google's demo id works until ours exists.
  mapId: MAP_ID || "DEMO_MAP_ID",
};

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

