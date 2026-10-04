import type { Activity, Category, City, Visibility } from "@/lib/types";

export const CATEGORY_META: Record<Category, { label: string; emoji: string; gradient: string }> = {
  party: { label: "Party", emoji: "🎉", gradient: "from-fuchsia-500 to-violet-600" },
  sports: { label: "Sports", emoji: "⚽", gradient: "from-emerald-500 to-teal-600" },
  gym: { label: "Gym", emoji: "🏋️", gradient: "from-orange-500 to-red-500" },
  outdoor: { label: "Outdoor", emoji: "⛰️", gradient: "from-sky-500 to-blue-600" },
  indoor: { label: "Indoor", emoji: "🎲", gradient: "from-amber-400 to-orange-500" },
  celebration: { label: "Celebration", emoji: "🎂", gradient: "from-pink-500 to-rose-500" },
  event: { label: "Event", emoji: "🎤", gradient: "from-indigo-500 to-purple-600" },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

export const VISIBILITY_META: Record<Visibility, { label: string; emoji: string }> = {
  open: { label: "Open", emoji: "🌍" },
  friends: { label: "Friends", emoji: "🔒" },
  friends_of_friends: { label: "Friends of friends", emoji: "👥" },
};

export const VISIBILITIES = Object.keys(VISIBILITY_META) as Visibility[];

export function byStart(a: Activity, b: Activity): number {
  return a.startsAt.localeCompare(b.startsAt);
}

export function mapsUrl(activity: Activity): string {
  const query =
    activity.lat !== undefined && activity.lng !== undefined
      ? `${activity.lat},${activity.lng}`
      : `${activity.venueName}, ${activity.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Fallback coordinates for activities without an exact location.
export const CITY_CENTERS: Record<City, { lat: number; lng: number }> = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  "Navi Mumbai": { lat: 19.033, lng: 73.0297 },
  Thane: { lat: 19.2183, lng: 72.9781 },
  Pune: { lat: 18.5204, lng: 73.8567 },
};

export interface Coords {
  lat: number;
  lng: number;
}

export function coordsOf(activity: Pick<Activity, "lat" | "lng" | "city">): Coords {
  return activity.lat !== undefined && activity.lng !== undefined
    ? { lat: activity.lat, lng: activity.lng }
    : CITY_CENTERS[activity.city];
}

const EARTH_RADIUS_KM = 6371;

// Haversine distance.
export function distanceKm(a: Coords, b: Coords): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Bundled cover photos a host can pick from.
export const COVER_PRESETS: { url: string; label: string }[] = [
  { url: "/images/covers/a1.jpg", label: "Party lights" },
  { url: "/images/covers/a2.jpg", label: "Football" },
  { url: "/images/covers/a5.jpg", label: "Gym" },
  { url: "/images/covers/a3.jpg", label: "Trek" },
  { url: "/images/covers/a4.jpg", label: "Board games" },
  { url: "/images/covers/a6.jpg", label: "Celebration" },
  { url: "/images/covers/a8.jpg", label: "Stage" },
  { url: "/images/covers/a12.jpg", label: "Yoga" },
];
