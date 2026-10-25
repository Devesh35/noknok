"use client";

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { ActivityCard } from "@/components/ActivityCard";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ArrowRightIcon, ListIcon, MapIcon } from "@/components/icons";
import { MapView } from "@/components/MapView";
import { UserRow } from "@/components/UserBits";
import { CITY_CENTERS } from "@/lib/activity";
import { isSameDay } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import type { ActivityCardItem, City, Me, PersonResult } from "@/lib/types";

const ROW_COUNT = 6;
const FEW_SPOTS = 3; // "needs N more" threshold
export const GRID =
  "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const ROW =
  "no-scrollbar stagger-fade -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 md:-mx-8 md:scroll-px-8 md:px-8 xl:mx-0 xl:scroll-px-0 xl:px-0 xl:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]";
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
  canSave = false,
}: {
  items: ActivityCardItem[];
  scope: string;
  row?: boolean;
  // Logged in: the cards get a heart.
  canSave?: boolean;
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
            mine={item.myJoin?.status === "going"}
            interested={canSave ? item.interested : undefined}
            scope={scope}
            className={row ? "w-80 shrink-0 snap-start md:w-[22rem]" : ""}
          />
        </ViewTransition>
      ))}
    </div>
  );
}

// "View all" lands on the complete list further down the page.
function ViewAll({ label = "View all" }: { label?: string }) {
  return (
    <a
      href="#nearby-heading"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
    >
      {label}
      <ArrowRightIcon className="h-4 w-4" />
    </a>
  );
}

function Row({
  id,
  title,
  items,
  action,
  canSave,
}: {
  id: string;
  title: ReactNode;
  items: ActivityCardItem[];
  action?: ReactNode;
  canSave: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className={SECTION_TITLE}>
          {title}
        </h2>
        {action ?? <ViewAll />}
      </div>
      <Cards items={items} scope={id} row canSave={canSave} />
    </section>
  );
}

// People and plans matching the search box. Locked plans are left out so a
// search can't reveal the title of a plan the viewer isn't allowed to see.
export function SearchResults({
  query,
  items,
  people,
  user,
}: {
  query: string;
  items: ActivityCardItem[];
  people: PersonResult[];
  user: Me | null;
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
          <Cards items={results} scope="search" canSave={user !== null} />
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
  const canSave = user !== null;
  const open = items.filter((item) => !item.locked);
  const today = open.filter((item) =>
    isSameDay(new Date(item.activity.startsAt), new Date(now())),
  );
  // Each plan shows in at most one curated row, in the order the rows appear;
  // "Plans in <city>" below stays complete.
  const used = new Set<string>();
  const take = (pick: (item: ActivityCardItem) => boolean) => {
    const row = open
      .filter((item) => !used.has(item.activity.id) && pick(item))
      .slice(0, ROW_COUNT);
    for (const item of row) used.add(item.activity.id);
    return row;
  };
  const first =
    today.length > 0
      ? {
          id: "today",
          title: "Happening today 🔥",
          items: take((item) => today.includes(item)),
        }
      : { id: "soon", title: "Coming up ⚡", items: take(() => true) };
  // Friends with a ticket; a friend who only hosts isn't "going".
  const withFriends = take((item) =>
    item.friends.some((f) => f.id !== item.activity.hostId),
  );
  const forYou = user
    ? take(
        (item) =>
          item.activity.hostId !== user.id &&
          user.interests.includes(item.activity.category),
      )
    : [];
  const lookingForPeople = take((item) => {
    const left = item.activity.capacity - item.activity.goingCount;
    return left > 0 && (item.activity.quick || left <= FEW_SPOTS);
  });
  const weekend = take((item) =>
    isThisWeekend(Date.parse(item.activity.startsAt)),
  );
  const nearby = items;

  return (
    <div className="space-y-6">
      <Row
        id={first.id}
        title={first.title}
        items={first.items}
        canSave={canSave}
      />
      <Row
        id="friends"
        title="Your friends are going"
        items={withFriends}
        canSave={canSave}
      />
      <Row id="foryou" title="For you ✨" items={forYou} canSave={canSave} />
      <Row
        id="looking"
        title="Looking for people"
        items={lookingForPeople}
        canSave={canSave}
        action={
          <Link
            href="/host/quick"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Post yours
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        }
      />
      <Row
        id="weekend"
        title="This weekend"
        items={weekend}
        canSave={canSave}
      />

      <section aria-labelledby="nearby-heading" className="scroll-mt-24">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="nearby-heading" className={SECTION_TITLE}>
            {view === "map" ? (
              "Plans on the map"
            ) : (
              <>
                Plans in <span className="text-location">{city}</span>
              </>
            )}
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
            activities={nearby
              .filter((item) => !item.locked)
              .map((item) => item.activity)}
            center={CITY_CENTERS[city]}
          />
        ) : (
          <Cards items={nearby} scope="list" canSave={canSave} />
        )}
      </section>
    </div>
  );
}
