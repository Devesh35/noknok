import "server-only";
import { CITY_CENTERS } from "@/lib/activity";
import { HOUR_MS } from "@/lib/time";
import type { Category, City } from "@/lib/types";
import { createActivity } from "@/server/activities";
import { now } from "@/server/clock";
import { connectDb } from "@/server/db";
import { requestJoin } from "@/server/joins";
import { ActivityModel, UserModel, type UserDoc } from "@/server/models";
import { fail } from "@/server/respond";
import { newId } from "@/lib/ids";
import { config } from "@/server/config";

// Dev-only sample data: a few hosts and a spread of upcoming events (free and
// paid, open and friends-only, empty and nearly full) for trying the app.

const HOSTS = [
  { handle: "seed_asha", name: "Asha Test", city: "Ulhasnagar" },
  { handle: "seed_rohan", name: "Rohan Test", city: "Kalyan" },
  { handle: "seed_meera", name: "Meera Test", city: "Ambernath" },
] as const;

interface Seed {
  title: string;
  category: Category;
  subcategory: string;
  city: City;
  venue: string;
  area: string;
  inHours: number;
  durationHours: number;
  priceP: number;
  capacity: number;
  visibility?: "open" | "friends_of_friends" | "friends";
  setting: "indoor" | "outdoor";
  description: string;
  host: number;
  joinedBy?: number[]; // indexes into HOSTS who already joined
}

const EVENTS: Seed[] = [
  { title: "5-a-side football", category: "sports", subcategory: "football", city: "Kalyan", venue: "Kalyan Sports Turf", area: "Kalyan West", inHours: 5, durationHours: 2, priceP: 0, capacity: 10, setting: "outdoor", host: 1, joinedBy: [0], description: "Friendly 5-a-side on artificial turf. Mixed skill levels, teams get shuffled. Bring water." },
  { title: "Badminton doubles night", category: "sports", subcategory: "badminton", city: "Ulhasnagar", venue: "Camp 3 Indoor Courts", area: "Camp 3", inHours: 9, durationHours: 2, priceP: 10_000, capacity: 8, setting: "indoor", host: 0, description: "Two courts booked, rotating doubles. Rackets and shuttles are provided." },
  { title: "Sunday sunrise trek", category: "outdoors", subcategory: "trek", city: "Ambernath", venue: "Shiv Mandir base", area: "Ambernath East", inHours: 30, durationHours: 5, priceP: 25_000, capacity: 15, setting: "outdoor", host: 2, joinedBy: [0, 1], description: "Easy two-hour climb to the temple viewpoint, then breakfast at the base. Start 5:30 sharp." },
  { title: "Board game café night", category: "games", subcategory: "board_games", city: "Ulhasnagar", venue: "Hopscotch Board Cafe", area: "Camp 3", inHours: 28, durationHours: 3, priceP: 15_000, capacity: 8, setting: "indoor", host: 0, joinedBy: [2], description: "Catan, Codenames and whatever you bring. Snacks and chai included." },
  { title: "Chess in the park", category: "games", subcategory: "chess", city: "Vitthalwadi", venue: "Station Road garden", area: "Vitthalwadi", inHours: 52, durationHours: 2, priceP: 0, capacity: 6, setting: "outdoor", host: 1, description: "Casual games, all levels. Bring a board if you have one." },
  { title: "Street food walk", category: "food", subcategory: "street_food", city: "Kalyan", venue: "Kalyan station market", area: "Kalyan East", inHours: 54, durationHours: 3, priceP: 20_000, capacity: 12, setting: "outdoor", host: 1, joinedBy: [0, 2], description: "Six stops, one plate each. Vegetarian and non-veg options. Cash tip for the vendors is on us." },
  { title: "Sunrise yoga", category: "fitness", subcategory: "yoga", city: "Ambernath", venue: "Lakeside lawn", area: "Ambernath West", inHours: 76, durationHours: 1, priceP: 0, capacity: 20, setting: "outdoor", host: 2, description: "Gentle one-hour flow for beginners. Bring a mat and a light layer." },
  { title: "Open mic evening", category: "music", subcategory: "open_mic", city: "Kalyan", venue: "The Green Room", area: "Kalyan West", inHours: 80, durationHours: 3, priceP: 10_000, capacity: 30, setting: "indoor", host: 1, description: "Songs, poems, stand-up, anything under five minutes. Sign up at the door or just come and listen." },
  { title: "Friends-only potluck", category: "food", subcategory: "potluck", city: "Ulhasnagar", venue: "Asha's terrace", area: "Camp 4", inHours: 100, durationHours: 3, priceP: 0, capacity: 10, visibility: "friends", setting: "outdoor", host: 0, description: "Bring a dish to share. Only for friends and anyone with the invite link." },
  { title: "Photography walk", category: "creative", subcategory: "photography", city: "Ulhasnagar", venue: "Old market lanes", area: "Camp 1", inHours: 120, durationHours: 2, priceP: 0, capacity: 10, visibility: "friends_of_friends", setting: "outdoor", host: 0, description: "Golden-hour walk through the old lanes. Phones are fine, cameras welcome." },
  { title: "Stand-up comedy night", category: "entertainment", subcategory: "standup", city: "Kalyan", venue: "Comedy Cellar", area: "Kalyan West", inHours: 144, durationHours: 2, priceP: 30_000, capacity: 25, setting: "indoor", host: 1, joinedBy: [0, 2], description: "Four comics, one headliner. Doors open 30 minutes early." },
  { title: "Rooftop house party", category: "event", subcategory: "party", city: "Ulhasnagar", venue: "Asha's rooftop", area: "Camp 3", inHours: 14, durationHours: 5, priceP: 0, capacity: 25, setting: "outdoor", host: 0, joinedBy: [1, 2], description: "Playlist, snacks and a skyline view. Bring a friend, bring a drink (soft or otherwise, 18+). Music off at 11." },
  { title: "Birthday bash for Rohan", category: "event", subcategory: "birthday", city: "Kalyan", venue: "The Green Room", area: "Kalyan West", inHours: 62, durationHours: 4, priceP: 0, capacity: 30, setting: "indoor", host: 1, joinedBy: [0], description: "Cake at 8, dancing after. No gifts, just turn up. Come hungry." },
  { title: "Saturday DJ night", category: "music", subcategory: "dj_night", city: "Kalyan", venue: "Pulse Lounge", area: "Kalyan East", inHours: 98, durationHours: 5, priceP: 40_000, capacity: 60, setting: "indoor", host: 1, description: "House and bollywood remixes until late. Entry includes one welcome drink. 18+ with ID." },
  { title: "Farewell get-together", category: "event", subcategory: "farewell", city: "Ambernath", venue: "Lakeside café", area: "Ambernath West", inHours: 46, durationHours: 3, priceP: 0, capacity: 15, setting: "outdoor", host: 2, joinedBy: [0], description: "Saying goodbye to Meera's flatmate before the move. Snacks, stories and a group photo." },
  { title: "Table tennis ladder", category: "sports", subcategory: "table_tennis", city: "Vitthalwadi", venue: "Community hall", area: "Vitthalwadi", inHours: 36, durationHours: 2, priceP: 0, capacity: 3, setting: "indoor", host: 2, joinedBy: [0, 1], description: "One spot left in a casual ladder. Winner stays on." },
];

// Creates the test hosts and events. Safe to run again: an event whose title
// already exists for the same host is skipped.
export async function seedTestEvents(): Promise<{ hosts: number; events: number }> {
  if (!config.devTools) fail("FORBIDDEN", "Not available");
  await connectDb();

  const hosts: UserDoc[] = [];
  for (const [index, host] of HOSTS.entries()) {
    const existing = await UserModel.findOne({ handle: host.handle }).lean();
    if (existing) {
      // Names change between versions of this seed; keep the host current.
      if (existing.name !== host.name) await UserModel.updateOne({ _id: existing._id }, { $set: { name: host.name } });
      hosts.push({ ...existing, name: host.name });
      continue;
    }
    const created = await UserModel.create({
      _id: newId("u"),
      handle: host.handle,
      name: host.name,
      city: host.city,
      bio: "Test host for trying NokNok.",
      phone: `000000000${index + 1}`,
      interests: [],
      phoneVerified: true,
      idVerified: false,
    });
    hosts.push(created.toObject());
  }

  let events = 0;
  for (const seed of EVENTS) {
    const host = hosts[seed.host];
    if (await ActivityModel.exists({ hostId: host._id, title: seed.title, deletedAt: { $exists: false } })) continue;
    const start = now() + seed.inHours * HOUR_MS;
    const center = CITY_CENTERS[seed.city];
    // A small, repeatable spread so pins on the map don't stack.
    const offset = ((events % 5) - 2) * 0.004;
    const activity = await createActivity(host, {
      title: seed.title,
      category: seed.category,
      subcategory: seed.subcategory,
      description: seed.description,
      venueName: seed.venue,
      address: `${seed.area}, ${seed.city}`,
      city: seed.city,
      area: seed.area,
      lat: center.lat + offset,
      lng: center.lng - offset,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + seed.durationHours * HOUR_MS).toISOString(),
      priceP: seed.priceP,
      capacity: seed.capacity,
      visibility: seed.visibility ?? "open",
      setting: seed.setting,
      beginnerFriendly: true,
      tags: [],
      waitlistMode: "auto",
      refundCutoffHours: 24,
    });
    for (const who of seed.joinedBy ?? []) {
      if (who !== seed.host) await requestJoin(hosts[who], activity.id).catch(() => undefined);
    }
    events++;
  }
  return { hosts: hosts.length, events };
}
