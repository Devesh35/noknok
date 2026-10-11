import "server-only";
import type { QueryFilter } from "mongoose";
import { isSameDay } from "@/lib/format";
import type { ActivityListQuery } from "@/lib/schemas";
import { DAY_MS } from "@/lib/time";
import { CATEGORIES_LIST, type ActivityCardItem, type Category } from "@/lib/types";
import { cardsFor } from "@/server/activities.cards";
import { devSettings, now } from "@/server/clock";
import { connectDb } from "@/server/db";
import { usersByIds } from "@/server/friends";
import { ActivityModel, type ActivityDoc, type UserDoc } from "@/server/models";
import { escapeRegex } from "@/server/users";

// Saturday or Sunday within the coming week.
function isThisWeekend(startMs: number): boolean {
  const day = new Date(startMs).getDay();
  return (day === 0 || day === 6) && startMs < now() + 8 * DAY_MS;
}

function matchesDate(startMs: number, filter: ActivityListQuery["date"]): boolean {
  switch (filter) {
    case "any":
      return true;
    case "today":
      return isSameDay(new Date(startMs), new Date(now()));
    case "tomorrow":
      return isSameDay(new Date(startMs), new Date(now() + DAY_MS));
    case "weekend":
      return isThisWeekend(startMs);
    case "week":
      return startMs <= now() + 7 * DAY_MS;
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

  // The date filter follows the calendar, so it is applied after the query;
  // fetching a little more than the page keeps the filtered page full.
  const docs = await ActivityModel.find(filter)
    .sort({ startsAt: 1 })
    .limit(query.limit * 4)
    .lean();
  const dated = docs.filter((doc) => matchesDate(doc.startsAt.getTime(), query.date));

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
