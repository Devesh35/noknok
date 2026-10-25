import "server-only";
import type { QueryFilter } from "mongoose";
import type { ActivityListQuery } from "@/lib/schemas";
import { DAY_MS } from "@/lib/time";
import { CATEGORIES_LIST, type ActivityCardItem, type Category } from "@/lib/types";
import { cardsFor } from "@/server/activities.cards";
import { devSettings, now } from "@/server/clock";
import { connectDb } from "@/server/db";
import { usersByIds } from "@/server/friends";
import { ActivityModel, type ActivityDoc, type UserDoc } from "@/server/models";
import { escapeRegex } from "@/server/users";

// Days follow the users' calendar, not the server's: Vercel runs in UTC, where
// a Saturday 2am plan in Mumbai is still Friday. Only Indian cities for now.
const TIME_ZONE = "Asia/Kolkata";
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

// Midnight (in TIME_ZONE) of the day containing `ms`, as a UTC instant.
export function startOfDay(ms: number): number {
  const p = Object.fromEntries(dayParts.formatToParts(ms).map((part) => [part.type, Number(part.value)]));
  const wallClock = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = wallClock - Math.floor(ms / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, p.day) - offset;
}

// 0 = Sunday … 6 = Saturday, in TIME_ZONE.
function weekday(ms: number): number {
  // startOfDay is a true midnight there, so the UTC weekday of noon that day is right.
  return new Date(startOfDay(ms) + 12 * 60 * 60 * 1000).getUTCDay();
}

type Range = { $gte?: Date; $lt?: Date; $lte?: Date };

// The date chip as a startsAt condition, so the database pages correctly: a
// filter applied after `limit` would hand back an empty page while matching
// plans sit further down the sort.
export function dateRanges(filter: ActivityListQuery["date"], nowMs: number): Range[] {
  const today = startOfDay(nowMs);
  switch (filter) {
    case "any":
      return [];
    case "today":
      return [{ $gte: new Date(today), $lt: new Date(today + DAY_MS) }];
    case "tomorrow":
      return [{ $gte: new Date(today + DAY_MS), $lt: new Date(today + 2 * DAY_MS) }];
    case "weekend": {
      // Saturday and Sunday within the coming week (today included if it is one).
      const ranges: Range[] = [];
      for (let d = 0; d < 8; d++) {
        const dayStart = today + d * DAY_MS;
        const day = weekday(dayStart);
        if (day === 0 || day === 6) ranges.push({ $gte: new Date(dayStart), $lt: new Date(dayStart + DAY_MS) });
      }
      return ranges;
    }
    case "week":
      return [{ $lte: new Date(nowMs + 7 * DAY_MS) }];
  }
}

export interface ActivityList {
  items: ActivityCardItem[];
  // Categories that have plans under the same filters, so the UI only offers
  // chips that lead somewhere. Computed before the category filter.
  categories: Category[];
}

// Discover list. Upcoming, active plans the viewer may see, plus locked ones
// when asked. A host filter also returns that host's past and cancelled plans.
export async function listActivities(
  query: ActivityListQuery,
  viewer: UserDoc | null,
): Promise<ActivityList> {
  await devSettings();
  await connectDb();
  const filter: QueryFilter<ActivityDoc> = { deletedAt: { $exists: false } };
  if (query.hostId) filter.hostId = query.hostId;
  else {
    filter.status = "active";
    filter.endsAt = { $gt: new Date(now()) };
  }
  if (query.city) filter.city = query.city;
  if (query.visibility) filter.visibility = query.visibility;
  if (query.setting) filter.setting = query.setting;
  if (query.free) filter.priceP = 0;
  if (query.beginner) filter.beginnerFriendly = true;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ title: pattern }, { description: pattern }, { venueName: pattern }, { tags: pattern }];
  }
  if (viewer?.blockedIds.length) filter.hostId = { ...(query.hostId ? { $eq: query.hostId } : {}), $nin: viewer.blockedIds };
  const ranges = dateRanges(query.date, now());
  if (ranges.length === 1) filter.startsAt = ranges[0];
  else if (ranges.length) filter.$and = ranges.map((startsAt) => ({ startsAt }));

  // Blocks, locks and the category chip are still applied in code below;
  // fetching more than the page keeps the filtered page full.
  const dated = await ActivityModel.find(filter)
    .sort({ startsAt: 1 })
    .limit(query.limit * 4)
    .lean();

  // Hosts who blocked the viewer don't appear to them.
  const hosts = await usersByIds(dated.map((d) => d.hostId));
  const open = viewer
    ? dated.filter((doc) => !hosts.get(doc.hostId)?.blockedIds.includes(viewer._id))
    : dated;

  const chosen = query.category ? open.filter((doc) => doc.category === query.category) : open;
  const cards = await cardsFor(chosen, viewer);
  const items = cards.filter((card) => query.includeLocked || !card.locked).slice(0, query.limit);
  const categories = CATEGORIES_LIST.filter((c) => open.some((doc) => doc.category === c));
  return { items, categories };
}
