"use client";

import { apiFetch, safe } from "@/lib/api/client";
import type { Result } from "@/lib/errors";
import type { GeoPlace } from "@/lib/types";

// Venue search on the map (OpenStreetMap through our API).
export function searchPlaces(q: string): Promise<Result<{ items: GeoPlace[] }>> {
  return safe(apiFetch("/geo/search", { query: { q } }));
}

// What is at a point the host dropped the pin on.
export function reversePlace(lat: number, lng: number): Promise<Result<{ place: GeoPlace | null }>> {
  return safe(apiFetch("/geo/reverse", { query: { lat, lng } }));
}
