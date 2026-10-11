import "server-only";
import { LAUNCH_AREA } from "@/lib/activity";
import { HOUR_MS } from "@/lib/time";
import type { GeoPlace } from "@/lib/types";
import { config } from "@/server/config";
import { reversePlaceOsm, searchPlacesOsm } from "@/server/geo.osm";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

// Venue search and reverse geocoding behind /api/geo/* (PLATFORM_PLAN §4.1).
// Google Places (New) + Geocoding with the server key; Nominatim when no key
// is set. The browser never sees the server key: it calls these routes,
// which are rate-limited per IP and cached here.

const CACHE_MS = 6 * HOUR_MS;
const SEARCH_LIMIT = 6;
const GEO_LIMIT = 120;
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.addressComponents",
].join(",");

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) cache.clear();
  return value;
}

interface Component {
  types: string[];
  // Places (New) spells it longText; Geocoding spells it long_name.
  longText?: string;
  long_name?: string;
}

function pick(components: Component[], ...types: string[]): string {
  for (const type of types) {
    const found = components.find((c) => c.types.includes(type));
    const text = found?.longText ?? found?.long_name;
    if (text) return text;
  }
  return "";
}

// Google's address parts → the GeoPlace fields VenuePicker's cityFrom() reads.
function areaAndCity(components: Component[]): { area: string; city: string } {
  return {
    area: pick(components, "sublocality_level_1", "sublocality", "neighborhood"),
    city: pick(components, "locality", "administrative_area_level_3", "administrative_area_level_2"),
  };
}

async function google<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!response.ok) fail("SERVER", "Place search is unavailable right now");
  return (await response.json()) as T;
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: Component[];
}

async function searchGoogle(q: string, key: string): Promise<GeoPlace[]> {
  const body = await google<{ places?: GooglePlace[] }>(PLACES_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: q,
      regionCode: "IN",
      languageCode: "en",
      maxResultCount: SEARCH_LIMIT,
      locationRestriction: {
        rectangle: {
          low: { latitude: LAUNCH_AREA.south, longitude: LAUNCH_AREA.west },
          high: { latitude: LAUNCH_AREA.north, longitude: LAUNCH_AREA.east },
        },
      },
    }),
  });
  return (body.places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      ...areaAndCity(p.addressComponents ?? []),
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}

interface GeocodeResult {
  place_id: string;
  formatted_address: string;
  address_components: Component[];
}

async function reverseGoogle(lat: number, lng: number, key: string): Promise<GeoPlace | null> {
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key, region: "in", language: "en" });
  const body = await google<{ status: string; results: GeocodeResult[] }>(`${GEOCODE_URL}?${params}`, {});
  if (body.status === "ZERO_RESULTS") return null;
  if (body.status !== "OK") fail("SERVER", "Place search is unavailable right now");
  const first = body.results[0];
  if (!first) return null;
  // A dropped pin has no venue name; VenuePicker keeps what the host typed.
  return { id: first.place_id, name: "", address: first.formatted_address, ...areaAndCity(first.address_components), lat, lng };
}

export async function searchPlaces(q: string, ip: string): Promise<GeoPlace[]> {
  rateLimit(`geo:${ip}`, GEO_LIMIT, HOUR_MS);
  const key = config.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return searchPlacesOsm(q);
  return cached(`g:search:${q.trim().toLowerCase()}`, () => searchGoogle(q, key));
}

export async function reversePlace(lat: number, lng: number, ip: string): Promise<GeoPlace | null> {
  rateLimit(`geo:${ip}`, GEO_LIMIT, HOUR_MS);
  const key = config.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return reversePlaceOsm(lat, lng);
  // ~10 m grid: neighbouring drops share a cache entry.
  return cached(`g:reverse:${lat.toFixed(4)},${lng.toFixed(4)}`, () => reverseGoogle(lat, lng, key));
}
