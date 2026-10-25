"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { buttonClass } from "@/components/Button";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/icons";
import { formatTime, isSameDay } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import type { ActivityCardItem, Me, User } from "@/lib/types";

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const LONG_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const MAX_PLANS = 3;
const MAX_PEOPLE = 4;

const CARD = "glass-card rounded-[1.75rem] p-5";
const CARD_TITLE = "text-lg font-extrabold text-ink";
const VIEW_ALL = "text-sm font-semibold text-brand-700 hover:underline";

// Monday-first week that contains `day`.
function weekOf(day: Date): Date[] {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getTime() + i * DAY_MS),
  );
}

// The week strip. Picking a day narrows the page to plans on that day; picking
// it again (or today's date) clears that.
export function WeekStrip({
  selected,
  onSelect,
}: {
  selected: Date | null;
  onSelect: (day: Date | null) => void;
}) {
  const today = new Date(now());
  const [offset, setOffset] = useState(0);
  const week = weekOf(new Date(today.getTime() + offset * 7 * DAY_MS));
  const shown = selected ?? today;
  return (
    <section aria-labelledby="week-heading" className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="week-heading" className={CARD_TITLE}>
            {selected && !isSameDay(selected, today)
              ? WEEKDAY.format(selected)
              : "Today"}
          </h2>
          <p className="mt-0.5 text-sm text-soft">{LONG_DATE.format(shown)}</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOffset(offset - 1)}
            aria-label="Previous week"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft hover:bg-surface-hi hover:text-ink"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOffset(offset + 1)}
            aria-label="Next week"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-soft hover:bg-surface-hi hover:text-ink"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1">
        {week.map((day) => {
          const isToday = isSameDay(day, today);
          const active = selected ? isSameDay(day, selected) : isToday;
          const past = day.getTime() + DAY_MS < today.getTime();
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={past}
              aria-pressed={active}
              onClick={() =>
                onSelect(
                  isToday || (selected && isSameDay(day, selected))
                    ? null
                    : day,
                )
              }
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs transition duration-200 disabled:opacity-35 ${
                active ? "text-ink" : "text-soft hover:text-ink"
              }`}
            >
              {WEEKDAY.format(day)}
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold ${
                  active
                    ? "bg-brand-600 text-white shadow-md shadow-brand-600/40"
                    : ""
                }`}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// The viewer's own upcoming tickets, nearest first.
export function YourPlans({
  items,
  user,
}: {
  items: ActivityCardItem[];
  user: Me | null;
}) {
  const mine = items
    .filter(
      (item) =>
        item.myJoin?.status === "going" || item.activity.hostId === user?.id,
    )
    .sort(
      (a, b) =>
        Date.parse(a.activity.startsAt) - Date.parse(b.activity.startsAt),
    )
    .slice(0, MAX_PLANS);
  return (
    <section aria-labelledby="yours-heading" className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="yours-heading" className={CARD_TITLE}>
          Your plans
        </h2>
        {user && (
          <Link href="/u/me" className={VIEW_ALL}>
            View all
          </Link>
        )}
      </div>
      {mine.length === 0 ? (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-line px-4 py-6 text-center">
          <CalendarIcon className="h-10 w-10 text-brand-700/70" />
          <p className="mt-3 font-bold text-ink">No plans coming up</p>
          <p className="mt-1 text-sm text-soft">
            Join a hangout or create one!
          </p>
          <Link href="/host" className={buttonClass("primary", "mt-4")}>
            <PlusIcon className="h-4 w-4" />
            Host something
          </Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {mine.map(({ activity }) => (
            <li key={activity.id}>
              <Link
                href={`/party/${activity.id}`}
                className="flex items-center gap-3 py-2.5 transition hover:text-brand-700"
              >
                <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-brand-600/15 py-1 leading-none">
                  <span className="text-base font-extrabold text-ink">
                    {new Date(activity.startsAt).getDate()}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold text-brand-700">
                    {WEEKDAY.format(new Date(activity.startsAt))}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">
                    {activity.title}
                  </span>
                  <span className="block truncate text-xs text-soft">
                    {formatTime(activity.startsAt)} · {activity.venueName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Hosts and joiners of nearby plans the viewer doesn't know yet.
export function PeopleNearYou({
  items,
  user,
}: {
  items: ActivityCardItem[];
  user: Me | null;
}) {
  const seen = new Set<string>(user ? [user.id] : []);
  const counts = new Map<string, { user: User; plans: number }>();
  for (const item of items) {
    if (item.locked) continue;
    for (const person of [item.host, ...item.attendees]) {
      if (seen.has(person.id)) {
        const entry = counts.get(person.id);
        if (entry) entry.plans += 1;
        continue;
      }
      seen.add(person.id);
      counts.set(person.id, { user: person, plans: 1 });
    }
  }
  const friendIds = new Set(
    items.flatMap((item) => item.friends.map((f) => f.id)),
  );
  const people = [...counts.values()]
    .filter((entry) => !friendIds.has(entry.user.id))
    .sort((a, b) => b.plans - a.plans)
    .slice(0, MAX_PEOPLE);
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="people-near-heading" className={CARD}>
      <h2 id="people-near-heading" className={CARD_TITLE}>
        People near you
      </h2>
      <ul className="mt-3 space-y-3">
        {people.map(({ user: person, plans }) => (
          <li key={person.id} className="flex items-center gap-3">
            <Avatar user={person} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">
                {person.name}
              </span>
              <span className="block truncate text-xs text-soft">
                {plans} {plans === 1 ? "hangout" : "hangouts"} nearby
              </span>
            </span>
            <Link
              href={`/u/${person.handle}`}
              className={buttonClass(
                "secondary",
                "min-h-9 px-3 py-1.5 text-xs",
              )}
            >
              View
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
