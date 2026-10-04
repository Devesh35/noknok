"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  ViewTransition,
  type ReactNode,
  type RefObject,
} from "react";
import {
  blockedIds,
  canView,
  friendsGoing,
  goingJoins,
  isPast,
  me,
  setCity,
  useDb,
  userById,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { FOCUS_SEARCH_EVENT, Logo } from "@/components/AppShell";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ListIcon, MapIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { MapView } from "@/components/MapView";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Sheet } from "@/components/Sheet";
import { ActivityCardSkeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import {
  byStart,
  CATEGORIES,
  CATEGORY_META,
  CITY_CENTERS,
  coordsOf,
  distanceKm,
  VISIBILITIES,
  VISIBILITY_META,
} from "@/lib/activity";
import { clearCoords, requestCoords, useCoords } from "@/lib/device";
import { isSameDay } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import { toast } from "@/lib/toast";
import {
  CITIES,
  type Activity,
  type Category,
  type City,
  type Setting,
  type User,
  type Visibility,
} from "@/lib/types";

type DateFilter = "any" | "today" | "tomorrow" | "weekend" | "week";

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "week", label: "Next 7 days" },
];
const SETTING_OPTIONS: { value: Setting | "any"; label: string }[] = [
  { value: "any", label: "Either" },
  { value: "indoor", label: "Indoors" },
  { value: "outdoor", label: "Outdoors" },
];
const DISTANCE_OPTIONS = [0, 2, 5, 10]; // km; 0 = any

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));

const ROW_COUNT = 6;
const FEW_SPOTS = 3; // "needs N more" threshold
const MAX_PEOPLE_RESULTS = 6;
const GRID = "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const ROW =
  "no-scrollbar stagger-fade -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 md:-mx-8 md:scroll-px-8 md:px-8";
const SECTION_TITLE = "text-xl font-extrabold text-ink";

interface Filters {
  category: Category | "all";
  visibility: Visibility | "all";
  date: DateFilter;
  setting: Setting | "any";
  freeOnly: boolean;
  beginnerOnly: boolean;
  showPrivate: boolean;
  maxKm: number;
}

const NO_FILTERS: Filters = {
  category: "all",
  visibility: "all",
  date: "any",
  setting: "any",
  freeOnly: false,
  beginnerOnly: false,
  showPrivate: false,
  maxKm: 0,
};

interface Item {
  activity: Activity;
  host?: User;
  going: number;
  attendees: User[];
  friends: User[];
  locked: boolean;
  distanceKm?: number;
}

// Saturday or Sunday within the coming week.
function isThisWeekend(startMs: number): boolean {
  const day = new Date(startMs).getDay();
  return (day === 0 || day === 6) && startMs < now() + 8 * DAY_MS;
}

function matchesDate(startMs: number, filter: DateFilter): boolean {
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

function matches(item: Item, filters: Filters): boolean {
  const { activity, locked } = item;
  if (filters.category !== "all" && activity.category !== filters.category) return false;
  if (filters.visibility !== "all" && activity.visibility !== filters.visibility) return false;
  if (filters.setting !== "any" && activity.setting !== filters.setting) return false;
  if (filters.freeOnly && activity.priceInr > 0) return false;
  if (filters.beginnerOnly && !activity.beginnerFriendly) return false;
  // Plans the viewer can't open stay hidden unless they ask to see them.
  if (locked && !filters.showPrivate) return false;
  if (filters.maxKm > 0 && (item.distanceKm ?? 0) > filters.maxKm) return false;
  return matchesDate(Date.parse(activity.startsAt), filters.date);
}

// How many filters in the sheet differ from the defaults.
function activeCount(filters: Filters): number {
  return (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter(
    (key) => key !== "category" && filters[key] !== NO_FILTERS[key],
  ).length;
}

// Typo-tolerant search. Locked activities are left out so a search can't
// reveal the title of a plan the viewer isn't allowed to see.
function searchPlans(items: Item[], query: string): Item[] {
  const fuse = new Fuse(
    items.filter((item) => !item.locked),
    {
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: "activity.title", weight: 3 },
        { name: "activity.venueName", weight: 2 },
        { name: "activity.address", weight: 1 },
        { name: "activity.tags", weight: 1 },
        { name: "host.name", weight: 2 },
        { name: "activity.city", weight: 1 },
        { name: "activity.category", weight: 1 },
        { name: "activity.description", weight: 0.5 },
      ],
    },
  );
  return fuse.search(query).map((result) => result.item);
}

function searchPeople(users: User[], query: string): User[] {
  const fuse = new Fuse(users, { threshold: 0.3, ignoreLocation: true, keys: ["name", "handle"] });
  return fuse
    .search(query)
    .slice(0, MAX_PEOPLE_RESULTS)
    .map((result) => result.item);
}

function greeting(): string {
  const hour = new Date(now()).getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

// Focuses the search box when arriving via the Search tab (/?search=1).
function SearchFocus({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const wantsSearch = useSearchParams().get("search") === "1";
  useEffect(() => {
    if (wantsSearch) inputRef.current?.focus();
  }, [wantsSearch, inputRef]);
  return null;
}

function Cards({ items, scope, row = false }: { items: Item[]; scope: string; row?: boolean }) {
  return (
    <div className={row ? ROW : `stagger-fade ${GRID}`}>
      {items.map((item) => (
        <ViewTransition key={item.activity.id}>
          <ActivityCard
            {...item}
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
  items: Item[];
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

function ChipGroup<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option.value}
            selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

export function HomeView() {
  const db = useDb();
  const coords = useCoords();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(NO_FILTERS);
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState<"filters" | "location" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Controls respond instantly; the result list follows as a transition so
  // cards animate to their new places. Typing stays un-animated.
  const applied = useDeferredValue(picked);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  const update = (patch: Partial<Filters>) => setPicked((current) => ({ ...current, ...patch }));
  const clear = () => {
    setPicked(NO_FILTERS);
    setQuery("");
  };

  const allowLocation = async () => {
    setSheet(null);
    try {
      await requestCoords();
      toast("Showing what's closest to you");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't get your location");
    }
  };

  const user = db ? me(db) : null;
  const city = db?.city ?? "Mumbai";

  let items: Item[] = [];
  let people: User[] = [];
  const trimmedQuery = query.trim();
  if (db) {
    const blocked = blockedIds(db);
    items = db.activities
      .filter((a) => a.status === "active" && !isPast(a) && !blocked.includes(a.hostId))
      .sort(byStart)
      .map((activity) => {
        const joins = goingJoins(db, activity.id);
        return {
          activity,
          host: userById(db, activity.hostId),
          going: joins.length,
          attendees: joins
            .map((join) => userById(db, join.userId))
            .filter((u): u is User => u !== undefined),
          friends: friendsGoing(db, activity, db.meId),
          locked: !canView(db, activity),
          distanceKm: coords ? distanceKm(coords, coordsOf(activity)) : undefined,
        };
      })
      .filter((item) => matches(item, applied));
    if (trimmedQuery) {
      people = searchPeople(
        db.users.filter((u) => u.id !== db.meId && !blocked.includes(u.id)),
        trimmedQuery,
      );
    }
  }

  const results = trimmedQuery ? searchPlans(items, trimmedQuery) : null;
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
      const left = item.activity.capacity - item.going;
      return left > 0 && (item.activity.quick || left <= FEW_SPOTS);
    })
    .slice(0, ROW_COUNT);
  const weekend = open
    .filter((item) => isThisWeekend(Date.parse(item.activity.startsAt)))
    .slice(0, ROW_COUNT);
  const nearby = coords
    ? [...items].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    : items.filter((item) => item.activity.city === city);
  const nothingFound = results ? results.length === 0 && people.length === 0 : items.length === 0;
  const filterCount = activeCount(picked);

  return (
    <div>
      <Suspense fallback={null}>
        <SearchFocus inputRef={searchRef} />
      </Suspense>

      <div className="glass sticky top-0 z-30 border-x-0 border-t-0 md:top-14">
        <div className="space-y-3 px-4 py-3 md:px-8">
          <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
            <Logo className="text-2xl md:hidden" />
            <SelectMenu
              label="City"
              icon="📍"
              value={city}
              onChange={setCity}
              options={CITY_OPTIONS}
              align="end"
              className="ml-auto font-semibold md:order-2 md:ml-0"
            />
            <div className="relative w-full md:order-1 md:flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search plans, places, people…"
                aria-label="Search plans, places and people"
                className="min-h-12 w-full rounded-full border border-line bg-surface/60 pr-4 pl-11 text-base shadow-sm outline-none transition duration-200 placeholder:text-faint focus:border-brand-600 focus:bg-surface-hi focus:ring-4 focus:ring-brand-600/15"
              />
            </div>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:-mx-8 md:px-8">
            <Chip selected={picked.category === "all"} onClick={() => update({ category: "all" })}>
              All
            </Chip>
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                selected={picked.category === category}
                onClick={() => update({ category })}
              >
                <span aria-hidden="true">{CATEGORY_META[category].emoji}</span>
                {CATEGORY_META[category].label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 py-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {user && (
              <p className="text-sm font-medium text-soft">
                {greeting()}, {user.name.split(" ")[0]} 👋
              </p>
            )}
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              What are you up for?
            </h1>
          </div>
          <div className="flex gap-2">
            <Chip selected={filterCount > 0} onClick={() => setSheet("filters")}>
              Filters{filterCount > 0 ? ` (${filterCount})` : ""}
            </Chip>
            <Chip
              selected={coords !== null}
              onClick={() => (coords ? clearCoords() : setSheet("location"))}
            >
              <span aria-hidden="true">🧭</span>
              Near me
            </Chip>
          </div>
        </div>

        {!db ? (
          <ViewTransition key="skeleton" exit="fade-out" default="none">
            <div className={GRID}>
              {Array.from({ length: 6 }, (_, index) => (
                <ActivityCardSkeleton key={index} />
              ))}
            </div>
          </ViewTransition>
        ) : nothingFound ? (
          <ViewTransition key="empty" enter="fade-in" exit="fade-out" default="none">
            <div>
              <EmptyState
                emoji="🔍"
                title={
                  trimmedQuery
                    ? `Nothing found for "${trimmedQuery}"`
                    : "Nothing matches right now"
                }
                body="Loosen the filters, or be the one who starts something."
                action={
                  <span className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" onClick={clear}>
                      Clear filters
                    </Button>
                    <Link href="/host/quick" className={buttonClass("primary")}>
                      Post a quick plan
                    </Link>
                  </span>
                }
              />
            </div>
          </ViewTransition>
        ) : results ? (
          <ViewTransition key="search" enter="fade-in" exit="fade-out" default="none">
            <div className="space-y-6">
              {people.length > 0 && (
                <section aria-labelledby="people-heading">
                  <h2 id="people-heading" className={`mb-3 ${SECTION_TITLE}`}>
                    People
                  </h2>
                  <div className="stagger-fade grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {people.map((person) => (
                      <UserRow key={person.id} user={person} />
                    ))}
                  </div>
                </section>
              )}
              {results.length > 0 && (
                <section aria-labelledby="results-heading">
                  <h2 id="results-heading" className={`mb-3 ${SECTION_TITLE}`}>
                    {results.length} plan{results.length === 1 ? "" : "s"} for{" "}
                    <span className="text-gradient">{trimmedQuery}</span>
                  </h2>
                  <Cards items={results} scope="search" />
                </section>
              )}
            </div>
          </ViewTransition>
        ) : (
          <ViewTransition key="results" enter="fade-in" exit="fade-out" default="none">
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
                    {coords ? (
                      "Closest to you"
                    ) : (
                      <>
                        Near you in <span className="text-location">{city}</span>
                      </>
                    )}
                  </h2>
                  <div className="flex gap-1">
                    <Chip selected={view === "list"} onClick={() => setView("list")}>
                      <ListIcon className="h-4 w-4" />
                      List
                    </Chip>
                    <Chip selected={view === "map"} onClick={() => setView("map")}>
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
                    center={coords ?? CITY_CENTERS[city]}
                    you={coords}
                  />
                ) : (
                  <Cards items={nearby} scope="list" />
                )}
              </section>
            </div>
          </ViewTransition>
        )}
      </div>

      {user && (
        <Link
          href="/host/quick"
          className="fixed right-4 bottom-24 z-30 hidden min-h-12 animate-pop items-center gap-1 rounded-full bg-brand-600 px-5 text-sm font-bold text-white shadow-xl shadow-brand-600/40 transition duration-200 hover:bg-brand-500 active:scale-95 md:bottom-8 md:inline-flex"
        >
          <PlusIcon className="h-5 w-5" />
          Quick plan
        </Link>
      )}

      <Sheet open={sheet === "filters"} onClose={() => setSheet(null)} title="Filters">
        <div className="space-y-5 pt-2">
          <ChipGroup
            label="When"
            value={picked.date}
            onChange={(date) => update({ date })}
            options={DATE_OPTIONS}
          />
          <ChipGroup
            label="Who can join"
            value={picked.visibility}
            onChange={(visibility) => update({ visibility })}
            options={[
              { value: "all" as const, label: "Any" },
              ...VISIBILITIES.map((visibility) => ({
                value: visibility,
                label: `${VISIBILITY_META[visibility].emoji} ${VISIBILITY_META[visibility].label}`,
              })),
            ]}
          />
          <ChipGroup
            label="Indoors or outdoors"
            value={picked.setting}
            onChange={(setting) => update({ setting })}
            options={SETTING_OPTIONS}
          />
          {coords && (
            <ChipGroup
              label="Distance"
              value={picked.maxKm}
              onChange={(maxKm) => update({ maxKm })}
              options={DISTANCE_OPTIONS.map((km) => ({
                value: km,
                label: km === 0 ? "Any" : `Within ${km} km`,
              }))}
            />
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">More</legend>
            <div className="flex flex-wrap gap-2">
              <Chip
                selected={picked.freeOnly}
                onClick={() => update({ freeOnly: !picked.freeOnly })}
              >
                Free only
              </Chip>
              <Chip
                selected={picked.beginnerOnly}
                onClick={() => update({ beginnerOnly: !picked.beginnerOnly })}
              >
                Beginner friendly
              </Chip>
              <Chip
                selected={picked.showPrivate}
                onClick={() => update({ showPrivate: !picked.showPrivate })}
              >
                Show private plans
              </Chip>
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPicked({ ...NO_FILTERS, category: picked.category })}
            >
              Reset
            </Button>
            <Button className="flex-1" onClick={() => setSheet(null)}>
              Show plans
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={sheet === "location"} onClose={() => setSheet(null)} title="Use your location?">
        <p className="text-sm text-soft">
          We&apos;ll only use it to show plans near you. It isn&apos;t stored.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={allowLocation}>Use my location</Button>
          <Button variant="secondary" onClick={() => setSheet(null)}>
            Not now
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
