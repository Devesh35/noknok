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
  type RefObject,
} from "react";
import {
  blockedIds,
  canView,
  goingJoins,
  isPast,
  me,
  setCity,
  useDb,
  userById,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { FOCUS_SEARCH_EVENT, Logo } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ListIcon, MapIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { MapView } from "@/components/MapView";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Sheet } from "@/components/Sheet";
import { ActivityCardSkeleton } from "@/components/Skeleton";
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
import { CITIES, type Activity, type Category, type City, type User, type Visibility } from "@/lib/types";

type DateFilter = "any" | "today" | "week";

const DATE_FILTERS: SelectOption<DateFilter>[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));

const VISIBILITY_OPTIONS: SelectOption<Visibility | "all">[] = [
  { value: "all", label: "Any visibility" },
  ...VISIBILITIES.map((visibility) => ({
    value: visibility,
    label: `${VISIBILITY_META[visibility].emoji} ${VISIBILITY_META[visibility].label}`,
  })),
];

const ROW_COUNT = 6;
const GRID = "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const ROW =
  "no-scrollbar stagger-fade -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 md:-mx-8 md:scroll-px-8 md:px-8";

interface Filters {
  category: Category | "all";
  visibility: Visibility | "all";
  date: DateFilter;
  freeOnly: boolean;
  showPrivate: boolean;
}

const NO_FILTERS: Filters = {
  category: "all",
  visibility: "all",
  date: "any",
  freeOnly: false,
  showPrivate: false,
};

interface Item {
  activity: Activity;
  host?: User;
  going: number;
  locked: boolean;
  distanceKm?: number;
}

function matches({ activity, locked }: Item, filters: Filters): boolean {
  if (filters.category !== "all" && activity.category !== filters.category) return false;
  if (filters.visibility !== "all" && activity.visibility !== filters.visibility) return false;
  if (filters.freeOnly && activity.priceInr > 0) return false;
  // Plans the viewer can't open stay hidden unless they ask to see them.
  if (locked && !filters.showPrivate) return false;
  const start = Date.parse(activity.startsAt);
  if (filters.date === "today" && !isSameDay(new Date(start), new Date(now()))) return false;
  if (filters.date === "week" && start > now() + 7 * DAY_MS) return false;
  return true;
}

// Typo-tolerant search. Locked activities are left out so a search can't
// reveal the title of a plan the viewer isn't allowed to see.
function search(items: Item[], query: string): Item[] {
  const fuse = new Fuse(
    items.filter((item) => !item.locked),
    {
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: "activity.title", weight: 3 },
        { name: "activity.venueName", weight: 2 },
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

export function HomeView() {
  const db = useDb();
  const coords = useCoords();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(NO_FILTERS);
  const [view, setView] = useState<"list" | "map">("list");
  const [askLocation, setAskLocation] = useState(false);
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
    setAskLocation(false);
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
  if (db) {
    const blocked = blockedIds(db);
    items = db.activities
      .filter((a) => a.status === "active" && !isPast(a) && !blocked.includes(a.hostId))
      .sort(byStart)
      .map((activity) => ({
        activity,
        host: userById(db, activity.hostId),
        going: goingJoins(db, activity.id).length,
        locked: !canView(db, activity),
        distanceKm: coords ? distanceKm(coords, coordsOf(activity)) : undefined,
      }))
      .filter((item) => matches(item, applied));
  }

  const trimmedQuery = query.trim();
  const results = trimmedQuery ? search(items, trimmedQuery) : null;
  const forYou = user
    ? items
        .filter(
          (item) =>
            !item.locked &&
            item.activity.hostId !== user.id &&
            user.interests.includes(item.activity.category),
        )
        .slice(0, ROW_COUNT)
    : [];
  const nearby = coords
    ? [...items].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    : items.filter((item) => item.activity.city === city);
  const shown = results ?? items;

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
                placeholder="Search parties, sports, treks, hosts…"
                aria-label="Search activities"
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

      <div className="space-y-6 px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            label="Visibility"
            value={picked.visibility}
            onChange={(visibility) => update({ visibility })}
            options={VISIBILITY_OPTIONS}
          />
          <SelectMenu
            label="Date"
            value={picked.date}
            onChange={(date) => update({ date })}
            options={DATE_FILTERS}
          />
          <Chip selected={picked.freeOnly} onClick={() => update({ freeOnly: !picked.freeOnly })}>
            Free only
          </Chip>
          <Chip
            selected={picked.showPrivate}
            onClick={() => update({ showPrivate: !picked.showPrivate })}
          >
            Show private
          </Chip>
          <Chip
            selected={coords !== null}
            onClick={() => (coords ? clearCoords() : setAskLocation(true))}
          >
            <span aria-hidden="true">🧭</span>
            Near me
          </Chip>
        </div>

        {!db ? (
          <ViewTransition key="skeleton" exit="fade-out" default="none">
            <div className={GRID}>
              {Array.from({ length: 6 }, (_, index) => (
                <ActivityCardSkeleton key={index} />
              ))}
            </div>
          </ViewTransition>
        ) : shown.length === 0 ? (
          <ViewTransition key="empty" enter="fade-in" exit="fade-out" default="none">
            <div>
              <EmptyState
                emoji="🔍"
                title={trimmedQuery ? `Nothing found for "${trimmedQuery}"` : "Nothing matches those filters"}
                body="Try a different category, date or search term."
                action={
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          </ViewTransition>
        ) : results ? (
          <ViewTransition key="search" enter="fade-in" exit="fade-out" default="none">
            <section aria-labelledby="results-heading">
              <h2 id="results-heading" className="mb-3 text-xl font-extrabold text-ink">
                {results.length} result{results.length === 1 ? "" : "s"} for{" "}
                <span className="text-gradient">{trimmedQuery}</span>
              </h2>
              <Cards items={results} scope="search" />
            </section>
          </ViewTransition>
        ) : (
          <ViewTransition key="results" enter="fade-in" exit="fade-out" default="none">
            <div className="space-y-6">
              {forYou.length > 0 && (
                <section aria-labelledby="foryou-heading">
                  <h2 id="foryou-heading" className="mb-3 text-xl font-extrabold text-ink">
                    For you <span aria-hidden="true">✨</span>
                  </h2>
                  <Cards items={forYou} scope="foryou" row />
                </section>
              )}

              <section aria-labelledby="soon-heading">
                <h2 id="soon-heading" className="mb-3 text-xl font-extrabold text-ink">
                  Happening soon <span aria-hidden="true">⚡</span>
                </h2>
                <Cards items={items.slice(0, ROW_COUNT)} scope="soon" row />
              </section>

              <section aria-labelledby="nearby-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="nearby-heading" className="text-xl font-extrabold text-ink">
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
                    body="Switch city or loosen the filters to see more."
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
          href="/host/new"
          className="fixed right-4 bottom-24 z-30 hidden min-h-12 animate-pop items-center gap-1 rounded-full bg-brand-600 px-5 text-sm font-bold text-white shadow-xl shadow-brand-600/40 transition duration-200 hover:bg-brand-500 active:scale-95 md:bottom-8 md:inline-flex"
        >
          <PlusIcon className="h-5 w-5" />
          Host
        </Link>
      )}

      <Sheet open={askLocation} onClose={() => setAskLocation(false)} title="Find plans near you">
        <p className="text-sm text-soft">
          We use your location once to sort activities by distance and show how far each one is.
          It stays on this device and is forgotten when you close the tab.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={allowLocation}>Use my location</Button>
          <Button variant="secondary" onClick={() => setAskLocation(false)}>
            Not now
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
