import "server-only";
import { HOUR_MS } from "@/lib/time";
import { LAUNCH_AREA } from "@/lib/activity";
import type { GeoPlace } from "@/lib/types";
import { fail } from "@/server/respond";

// Venue search and reverse geocoding through OpenStreetMap's Nominatim, used
// when no Google Maps server key is set (development). Its usage policy
// wants a real User-Agent and at most one request a second, so the browser
// never calls it directly: results are cached here and the client debounces.
const BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "NokNok/0.1 (plans app; contact via noknok.in)";
const CACHE_MS = 6 * HOUR_MS;
const SEARCH_LIMIT = 6;
// west,north,east,south
const VIEWBOX = [LAUNCH_AREA.west, LAUNCH_AREA.north, LAUNCH_AREA.east, LAUNCH_AREA.south].join(",");

const cache = new Map<string, { at: number; value: unknown }>();

async function nominatim<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams({ format: "jsonv2", ...params })}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) fail("SERVER", "Place search is unavailable right now");
  const value = (await response.json()) as T;
  cache.set(url, { at: Date.now(), value });
  if (cache.size > 5000) cache.clear();
  return value;
}

interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

function toPlace(place: NominatimPlace): GeoPlace {
  const a = place.address ?? {};
  const name = place.name || a.amenity || a.leisure || a.building || a.road || "";
  const parts = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.postcode]
    .filter(Boolean)
    .filter((part, i, all) => all.indexOf(part) === i);
  return {
    id: String(place.place_id),
    name,
    address: parts.join(", ") || place.display_name,
    city: a.city || a.town || a.village || a.county || "",
    area: a.suburb || a.neighbourhood || a.city_district || "",
    lat: Number(place.lat),
    lng: Number(place.lon),
  };
}

export async function searchPlacesOsm(q: string): Promise<GeoPlace[]> {
  const places = await nominatim<NominatimPlace[]>("/search", {
    q,
    addressdetails: "1",
    countrycodes: "in",
    viewbox: VIEWBOX,
    bounded: "1",
    limit: String(SEARCH_LIMIT),
  });
  return places.map(toPlace);
}

export async function reversePlaceOsm(lat: number, lng: number): Promise<GeoPlace | null> {
  const place = await nominatim<NominatimPlace | { error: string }>("/reverse", {
    lat: String(lat),
    lon: String(lng),
    addressdetails: "1",
    zoom: "17",
  });
  if ("error" in place) return null;
  return { ...toPlace(place), lat, lng };
}
