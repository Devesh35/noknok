"use client";

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ListIcon, MapIcon } from "@/components/icons";
import { MapView } from "@/components/MapView";
import { UserRow } from "@/components/UserBits";
import { CITY_CENTERS } from "@/lib/activity";
import { isSameDay } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import type { ActivityCardItem, City, Me, PersonResult } from "@/lib/types";

const ROW_COUNT = 6;
const FEW_SPOTS = 3; // "needs N more" threshold
export const GRID = "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const ROW =
  "no-scrollbar stagger-fade -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 md:-mx-8 md:scroll-px-8 md:px-8";
export const SECTION_TITLE = "text-xl font-extrabold text-ink";

// Saturday or Sunday within the coming week.
function isThisWeekend(startMs: number): boolean {
  const day = new Date(startMs).getDay();
  return (day === 0 || day === 6) && startMs < now() + 8 * DAY_MS;
}

function Cards({
  items,
  scope,
  row = false,
}: {
  items: ActivityCardItem[];
  scope: string;
  row?: boolean;
}) {
  return (
    <div className={row ? ROW : `stagger-fade ${GRID}`}>
      {items.map((item) => (
        <ViewTransition key={item.activity.id}>
          <ActivityCard
            activity={item.activity}
            going={item.activity.goingCount}
            host={item.host}
            attendees={item.attendees}
            friends={item.friends}
            locked={item.locked}
            scope={scope}
            className={row ? "w-80 shrink-0 snap-start md:w-96" : ""}
          />
        </ViewTransition>
      ))}
    </div>
  );
}

function Row({
  id,
  title,
  items,
  action,
}: {
  id: string;
  title: ReactNode;
  items: ActivityCardItem[];
  action?: ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className={SECTION_TITLE}>
          {title}
        </h2>
        {action}
      </div>
      <Cards items={items} scope={id} row />
    </section>
  );
}

// People and plans matching the search box. Locked plans are left out so a
// search can't reveal the title of a plan the viewer isn't allowed to see.
export function SearchResults({
  query,
  items,
  people,
}: {
  query: string;
  items: ActivityCardItem[];
  people: PersonResult[];
}) {
  const results = items.filter((item) => !item.locked);
  return (
    <div className="space-y-6">
      {people.length > 0 && (
        <section aria-labelledby="people-heading">
          <h2 id="people-heading" className={`mb-3 ${SECTION_TITLE}`}>
            People
          </h2>
          <div className="stagger-fade grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
              <UserRow
                key={person.user.id}
                user={person.user}
                note={
                  person.isFriend
                    ? "Friend"
                    : person.mutualCount > 0
                      ? `${person.mutualCount} mutual friend${person.mutualCount === 1 ? "" : "s"}`
                      : undefined
                }
              />
            ))}
          </div>
        </section>
      )}
      {results.length > 0 && (
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className={`mb-3 ${SECTION_TITLE}`}>
            {results.length} plan{results.length === 1 ? "" : "s"} for{" "}
            <span className="text-gradient">{query}</span>
          </h2>
          <Cards items={results} scope="search" />
        </section>
      )}
    </div>
  );
}

// The browse layout: themed rows on top, then everything nearby.
export function HomeSections({
  items,
  user,
  city,
  view,
  onView,
}: {
  items: ActivityCardItem[];
  user: Me | null;
  city: City;
  view: "list" | "map";
  onView: (view: "list" | "map") => void;
}) {
  const open = items.filter((item) => !item.locked);
  const today = open.filter((item) =>
    isSameDay(new Date(item.activity.startsAt), new Date(now())),
  );
  const forYou = user
    ? open
        .filter(
          (item) =>
            item.activity.hostId !== user.id && user.interests.includes(item.activity.category),
        )
        .slice(0, ROW_COUNT)
    : [];
  const withFriends = open.filter((item) => item.friends.length > 0).slice(0, ROW_COUNT);
  const lookingForPeople = open
    .filter((item) => {
      const left = item.activity.capacity - item.activity.goingCount;
      return left > 0 && (item.activity.quick || left <= FEW_SPOTS);
    })
    .slice(0, ROW_COUNT);
  const weekend = open
    .filter((item) => isThisWeekend(Date.parse(item.activity.startsAt)))
    .slice(0, ROW_COUNT);
  const nearby = items;

  return (
    <div className="space-y-6">
      {today.length > 0 ? (
        <Row id="today" title="Happening today 🔥" items={today.slice(0, ROW_COUNT)} />
      ) : (
        <Row id="soon" title="Coming up ⚡" items={open.slice(0, ROW_COUNT)} />
      )}
      <Row id="friends" title="Your friends are going" items={withFriends} />
      <Row id="foryou" title="For you ✨" items={forYou} />
      <Row
        id="looking"
        title="Looking for people"
        items={lookingForPeople}
        action={
          <Link
            href="/host/quick"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline"
          >
            Post yours
          </Link>
        }
      />
      <Row id="weekend" title="This weekend" items={weekend} />

      <section aria-labelledby="nearby-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="nearby-heading" className={SECTION_TITLE}>
            Plans in <span className="text-location">{city}</span>
          </h2>
          <div className="flex gap-1">
            <Chip selected={view === "list"} onClick={() => onView("list")}>
              <ListIcon className="h-4 w-4" />
              List
            </Chip>
            <Chip selected={view === "map"} onClick={() => onView("map")}>
              <MapIcon className="h-4 w-4" />
              Map
            </Chip>
          </div>
        </div>
        {nearby.length === 0 ? (
          <EmptyState
            emoji="🗺️"
            title={`Nothing in ${city} right now`}
            body="Switch city, or post a quick plan and see who joins."
          />
        ) : view === "map" ? (
          <MapView
            activities={nearby.filter((item) => !item.locked).map((item) => item.activity)}
            center={CITY_CENTERS[city]}
          />
        ) : (
          <Cards items={nearby} scope="list" />
        )}
      </section>
    </div>
  );
}
