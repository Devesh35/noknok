import { coverFor, SUBCATEGORIES } from "@/lib/activity";
import type { Category, Setting } from "@/lib/types";

// Guesses category, subcategory, indoor/outdoor and a cover from the title and
// description, so the host confirms instead of filling in. Keyword-based on
// purpose: it runs in the browser, instantly, and the host always sees and
// can change the result.

export interface Guess {
  category: Category;
  subcategory: string;
  setting: Setting;
  coverUrl: string;
}

// subcategory -> words that point at it (lower case; matched as whole words
// or word prefixes, so "treks" and "trekking" match "trek").
const KEYWORDS: Record<Category, Record<string, string[]>> = {
  sports: {
    football: ["football", "soccer", "futsal", "5-a-side", "turf"],
    cricket: ["cricket", "box cricket", "gully cricket", "nets"],
    badminton: ["badminton", "shuttle"],
    tennis: ["tennis", "lawn tennis"],
    basketball: ["basketball", "hoops"],
    table_tennis: ["table tennis", "ping pong", "tt "],
    swimming: ["swim", "pool session", "laps"],
    cycling: ["cycling", "cycle ride", "bike ride", "bicycle"],
    volleyball: ["volleyball", "throwball"],
  },
  social: {
    meetup: [
      "meetup",
      "meet up",
      "hangout",
      "hang out",
      "new in town",
      "new to the city",
    ],
    networking: [
      "networking",
      "founders",
      "startup",
      "professionals",
      "industry",
    ],
    language_exchange: [
      "language",
      "french",
      "spanish",
      "german",
      "japanese",
      "conversation practice",
    ],
    book_club: ["book club", "reading", "novel", "author"],
    volunteering: [
      "volunteer",
      "ngo",
      "charity",
      "donation drive",
      "teach kids",
    ],
    cleanup: ["cleanup", "clean-up", "clean up", "plogging"],
    coffee: ["coffee", "chai", "cafe chat", "catch up"],
  },
  outdoors: {
    trek: ["trek", "fort", "sahyadri", "summit", "peak"],
    hike: ["hike", "hiking", "nature walk", "trail"],
    camping: ["camp", "tent", "bonfire", "overnight"],
    beach: ["beach", "seaside", "shore"],
    picnic: ["picnic", "garden", "park day"],
    road_trip: ["road trip", "drive to", "long drive", "bike trip"],
    stargazing: ["stargazing", "stars", "astronomy", "telescope", "meteor"],
  },
  games: {
    board_games: ["board game", "catan", "monopoly", "ludo", "carrom"],
    card_games: ["card game", "poker", "uno", "rummy", "teen patti"],
    video_games: [
      "video game",
      "gaming",
      "fifa",
      "valorant",
      "playstation",
      "xbox",
      "lan party",
    ],
    quiz: ["quiz", "trivia", "pub quiz"],
    escape_room: ["escape room", "mystery room"],
    chess: ["chess"],
    bowling: ["bowling"],
    arcade: ["arcade", "timezone", "smaaash"],
  },
  food: {
    dinner: ["dinner", "supper", "restaurant night"],
    brunch: ["brunch", "breakfast"],
    street_food: [
      "street food",
      "chaat",
      "vada pav",
      "food walk",
      "food crawl",
      "khau galli",
    ],
    cooking: ["cook", "cooking", "bake", "baking", "recipe"],
    potluck: ["potluck", "bring a dish"],
    cafe_hopping: ["cafe hop", "café hop", "cafes", "cafés"],
  },
  creative: {
    art: ["painting", "paint", "sketch", "drawing", "art jam", "canvas"],
    photography: ["photo walk", "photography", "camera", "shoot"],
    writing: ["writing", "poetry", "poem", "journaling", "write"],
    crafts: ["craft", "diy", "origami", "knitting", "candle making"],
    pottery: ["pottery", "ceramic", "clay"],
  },
  fitness: {
    gym: ["gym", "workout", "lifting", "weights", "crossfit"],
    yoga: ["yoga", "meditation", "pranayama", "breathwork"],
    running: ["run", "running", "5k", "10k", "marathon", "jog"],
    hiit: ["hiit", "bootcamp", "boot camp", "circuit", "calisthenics"],
    pilates: ["pilates"],
    martial_arts: [
      "boxing",
      "mma",
      "karate",
      "jiu jitsu",
      "kickboxing",
      "muay thai",
      "self defence",
    ],
    dance: ["dance", "zumba", "salsa", "bollywood dance", "hip hop"],
  },
  music: {
    concert: ["concert", "gig", "live band", "live music"],
    jam: ["jam", "jamming", "guitar", "drums", "band practice"],
    karaoke: ["karaoke", "sing along", "singalong"],
    dj_night: ["dj", "techno", "house music", "edm", "club night"],
    open_mic: ["open mic"],
    classical: [
      "classical",
      "carnatic",
      "hindustani",
      "sitar",
      "tabla",
      "symphony",
    ],
  },
  entertainment: {
    movie: ["movie", "film", "cinema", "screening", "watch party"],
    standup: ["stand-up", "standup", "comedy", "comedian", "improv"],
    theatre: ["theatre", "theater", "play", "drama", "musical"],
    exhibition: ["exhibition", "museum", "gallery", "art show"],
    amusement_park: [
      "amusement park",
      "imagica",
      "theme park",
      "water park",
      "essel world",
    ],
    live_sports: [
      "screening",
      "watch the match",
      "ipl",
      "world cup",
      "match night",
    ],
  },
  event: {
    birthday: ["birthday", "bday", "turning"],
    marriage: ["wedding", "marriage", "shaadi", "sangeet", "mehendi", "haldi"],
    bachelor: ["bachelor", "stag", "bachelors"],
    bachelorette: ["bachelorette", "hen party", "bridal shower"],
    reception: ["reception"],
    party: ["party", "house party", "bash", "celebration", "new year"],
    get_together: ["get together", "get-together", "reunion", "gathering"],
    anniversary: ["anniversary"],
    farewell: ["farewell", "send off", "send-off", "goodbye", "going away"],
  },
};

// Subcategories that usually happen outside.
const OUTDOOR = new Set([
  "football",
  "cricket",
  "tennis",
  "cycling",
  "volleyball",
  "trek",
  "hike",
  "camping",
  "beach",
  "picnic",
  "road_trip",
  "stargazing",
  "cleanup",
  "running",
  "photography",
  "street_food",
  "amusement_park",
]);

function countHits(text: string, words: string[]): number {
  let hits = 0;
  for (const word of words) {
    const pattern = new RegExp(
      `(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    if (pattern.test(text)) hits += word.includes(" ") ? 2 : 1; // phrases are stronger
  }
  return hits;
}

// null when nothing in the text points anywhere.
export function guessActivity(
  title: string,
  description: string,
): Guess | null {
  // The title counts double: it is what the host chose to lead with.
  const text = `${title} ${title} ${description}`.toLowerCase();
  let best: { category: Category; subcategory: string; score: number } | null =
    null;
  for (const category of Object.keys(KEYWORDS) as Category[]) {
    for (const [subcategory, words] of Object.entries(KEYWORDS[category])) {
      const score = countHits(text, words);
      if (score > 0 && (!best || score > best.score))
        best = { category, subcategory, score };
    }
  }
  if (!best) return null;
  const known = SUBCATEGORIES[best.category].some(
    (s) => s.value === best.subcategory,
  );
  const subcategory = known ? best.subcategory : "other";
  return {
    category: best.category,
    subcategory,
    setting: OUTDOOR.has(subcategory) ? "outdoor" : "indoor",
    coverUrl: coverFor(best.category, subcategory),
  };
}
