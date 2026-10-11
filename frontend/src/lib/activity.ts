import type { Activity, Category, City, Visibility } from "@/lib/types";

export const CATEGORY_META: Record<Category, { label: string; emoji: string; gradient: string }> = {
  sports: { label: "Sports", emoji: "⚽", gradient: "from-emerald-500 to-teal-600" },
  social: { label: "Social", emoji: "🎉", gradient: "from-fuchsia-500 to-violet-600" },
  outdoors: { label: "Outdoors", emoji: "🌲", gradient: "from-sky-500 to-blue-600" },
  games: { label: "Games", emoji: "🎲", gradient: "from-amber-400 to-orange-500" },
  food: { label: "Food", emoji: "🍽️", gradient: "from-pink-500 to-rose-500" },
  creative: { label: "Creative", emoji: "🎨", gradient: "from-rose-400 to-orange-400" },
  fitness: { label: "Fitness", emoji: "💪", gradient: "from-orange-500 to-red-500" },
  music: { label: "Music", emoji: "🎵", gradient: "from-violet-500 to-indigo-600" },
  entertainment: { label: "Entertainment", emoji: "🎬", gradient: "from-indigo-500 to-purple-600" },
  event: { label: "Event", emoji: "🎊", gradient: "from-pink-500 to-fuchsia-600" },
};

export interface Subcategory {
  value: string;
  label: string;
}

const sub = (pairs: [string, string][]): Subcategory[] =>
  pairs.map(([value, label]) => ({ value, label }));

// What a plan is, one level below the category. Shown as chips once a
// category is picked, in both the quick and the full form.
export const SUBCATEGORIES: Record<Category, Subcategory[]> = {
  sports: sub([
    ["football", "Football"],
    ["cricket", "Cricket"],
    ["badminton", "Badminton"],
    ["tennis", "Tennis"],
    ["basketball", "Basketball"],
    ["table_tennis", "Table tennis"],
    ["swimming", "Swimming"],
    ["cycling", "Cycling"],
    ["volleyball", "Volleyball"],
    ["other", "Other sport"],
  ]),
  social: sub([
    ["meetup", "Meetup"],
    ["networking", "Networking"],
    ["language_exchange", "Language exchange"],
    ["book_club", "Book club"],
    ["volunteering", "Volunteering"],
    ["cleanup", "Cleanup drive"],
    ["coffee", "Coffee & chat"],
    ["other", "Other"],
  ]),
  outdoors: sub([
    ["trek", "Trek"],
    ["hike", "Hike"],
    ["camping", "Camping"],
    ["beach", "Beach"],
    ["picnic", "Picnic"],
    ["road_trip", "Road trip"],
    ["stargazing", "Stargazing"],
    ["other", "Other"],
  ]),
  games: sub([
    ["board_games", "Board games"],
    ["card_games", "Card games"],
    ["video_games", "Video games"],
    ["quiz", "Quiz night"],
    ["escape_room", "Escape room"],
    ["chess", "Chess"],
    ["bowling", "Bowling"],
    ["arcade", "Arcade"],
    ["other", "Other"],
  ]),
  food: sub([
    ["dinner", "Dinner"],
    ["brunch", "Brunch"],
    ["street_food", "Street food walk"],
    ["cooking", "Cooking together"],
    ["potluck", "Potluck"],
    ["cafe_hopping", "Café hopping"],
    ["other", "Other"],
  ]),
  creative: sub([
    ["art", "Art & painting"],
    ["photography", "Photo walk"],
    ["writing", "Writing"],
    ["crafts", "Crafts & DIY"],
    ["pottery", "Pottery"],
    ["other", "Other"],
  ]),
  fitness: sub([
    ["gym", "Gym session"],
    ["yoga", "Yoga"],
    ["running", "Running"],
    ["hiit", "HIIT / bootcamp"],
    ["pilates", "Pilates"],
    ["martial_arts", "Martial arts"],
    ["dance", "Dance class"],
    ["other", "Other"],
  ]),
  music: sub([
    ["concert", "Concert"],
    ["jam", "Jam session"],
    ["karaoke", "Karaoke"],
    ["dj_night", "DJ night"],
    ["open_mic", "Open mic"],
    ["classical", "Classical"],
    ["other", "Other"],
  ]),
  entertainment: sub([
    ["movie", "Movie"],
    ["standup", "Stand-up comedy"],
    ["theatre", "Theatre"],
    ["exhibition", "Exhibition / museum"],
    ["amusement_park", "Amusement park"],
    ["live_sports", "Live sports screening"],
    ["other", "Other"],
  ]),
  event: sub([
    ["birthday", "Birthday"],
    ["marriage", "Wedding"],
    ["bachelor", "Bachelor"],
    ["bachelorette", "Bachelorette"],
    ["reception", "Reception"],
    ["party", "Party"],
    ["get_together", "Get-together"],
    ["anniversary", "Anniversary"],
    ["farewell", "Farewell"],
    ["other", "Other"],
  ]),
};

export function subcategoryLabel(category: Category, subcategory?: string): string {
  const found = subcategory && SUBCATEGORIES[category].find((s) => s.value === subcategory);
  return found ? found.label : CATEGORY_META[category].label;
}

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];

// Localities offered within each city, so "where" can be more precise than
// the city without typing an address.
export const AREAS_BY_CITY: Record<City, readonly string[]> = {
  Ulhasnagar: ["Camp 1", "Camp 2", "Camp 3", "Camp 4", "Camp 5", "Shahad"],
  Ambernath: ["Ambernath East", "Ambernath West", "Badlapur Road", "Shivaji Nagar"],
  Vitthalwadi: ["Vitthalwadi Station", "Nehru Chowk", "Hill Line"],
  Kalyan: ["Kalyan East", "Kalyan West", "Khadakpada", "Dombivli East", "Dombivli West", "Titwala"],
};

export function areasFor(city: City | ""): readonly string[] {
  return city ? AREAS_BY_CITY[city] : [];
}

// "Who can join?", from most to least open.
export const VISIBILITY_META: Record<Visibility, { label: string; emoji: string; help: string }> = {
  open: { label: "Anyone", emoji: "🌍", help: "Anyone on NokNok can see and join." },
  friends_of_friends: {
    label: "Friends of friends",
    emoji: "👥",
    help: "Your friends, and people who share a friend with you.",
  },
  friends: {
    label: "Friends only",
    emoji: "🔒",
    help: "Only your friends, plus anyone you send your invite link.",
  },
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
  Ulhasnagar: { lat: 19.2215, lng: 73.1645 },
  Ambernath: { lat: 19.2096, lng: 73.186 },
  Vitthalwadi: { lat: 19.213, lng: 73.1545 },
  Kalyan: { lat: 19.2403, lng: 73.1305 },
};

// The launch cities in one box (Kalyan to Ambernath). Venue search offers
// nothing outside it.
export const LAUNCH_AREA = { south: 19.14, west: 73.05, north: 19.32, east: 73.28 } as const;

export interface Coords {
  lat: number;
  lng: number;
}

export function coordsOf(activity: Pick<Activity, "lat" | "lng" | "city">): Coords {
  return activity.lat !== undefined && activity.lng !== undefined
    ? { lat: activity.lat, lng: activity.lng }
    : CITY_CENTERS[activity.city];
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
