"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  ViewTransition,
  type RefObject,
} from "react";
import {
  getPreferredCity,
  setPreferredCity,
  useActivities,
  useMe,
  usePeople,
} from "@/api";
import { FOCUS_SEARCH_EVENT, Logo } from "@/components/AppShell";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { ActivityCardSkeleton } from "@/components/Skeleton";
import { CATEGORIES, CATEGORY_META } from "@/lib/activity";
import { now } from "@/lib/time";
import { CITIES, type ActivityCardItem, type City } from "@/lib/types";
import {
  activeCount,
  FiltersSheet,
  NO_FILTERS,
  toListQuery,
  type Filters,
} from "@/views/HomeFilters";
import { GRID, HomeSections, SearchResults } from "@/views/HomeRows";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
const DEFAULT_CITY: City = "Ulhasnagar";
const SEARCH_DEBOUNCE_MS = 250;

function isCity(value: string | null): value is City {
  return CITIES.includes(value as City);
}

// Reads the stored city once hydration is done; the server render can't know it.
const noSubscribe = () => () => {};
function useStoredCity(): City | null {
  const stored = useSyncExternalStore(noSubscribe, getPreferredCity, () => null);
  return isCity(stored) ? stored : null;
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

// The search box updates instantly; the request waits for a pause in typing.
function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

export function HomeView() {
  const { me: user } = useMe();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(NO_FILTERS);
  const [chosenCity, setChosenCity] = useState<City | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState<"filters" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Controls respond instantly; the result list follows as a transition so
  // cards animate to their new places. Typing stays un-animated.
  const applied = useDeferredValue(picked);
  const trimmedQuery = query.trim();
  const searched = useDebounced(trimmedQuery);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  // The city is a device preference; a logged-in user's own city is the
  // fallback when they haven't picked one yet.
  const storedCity = useStoredCity();
  const city = chosenCity ?? storedCity ?? user?.city ?? DEFAULT_CITY;
  const pickCity = (next: City) => {
    setPreferredCity(next);
    setChosenCity(next);
  };

  // The last list stays on screen while a filter change is fetching, so the
  // skeleton only shows on first load.
  const activities = useActivities(toListQuery(applied, city, searched), true);
  const people = usePeople(searched);
  const fetched = activities.data?.items ?? null;
  // Only offer categories that have plans; keep the selected one so it can be
  // cleared even when its last plan has gone.
  const available = activities.data?.categories ?? [];
  const chips = CATEGORIES.filter(
    (category) => available.includes(category) || category === picked.category,
  );

  const update = (patch: Partial<Filters>) => setPicked((current) => ({ ...current, ...patch }));
  const clear = () => {
    setPicked(NO_FILTERS);
    setQuery("");
  };

  const items = fetched;
  const peopleFound = people.data?.items ?? [];
  const searching = searched.length > 0;
  const nothingFound =
    items !== null &&
    (searching
      ? items.every((item) => item.locked) && peopleFound.length === 0
      : items.length === 0);
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
              onChange={pickCity}
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
            {/* Nothing is selected by default; "All" is the way back once a category is picked. */}
            {picked.category !== "all" && (
              <Chip selected={false} onClick={() => update({ category: "all" })}>
                All
              </Chip>
            )}
            {chips.map((category) => (
              <Chip
                key={category}
                selected={picked.category === category}
                onClick={() =>
                  update({ category: picked.category === category ? "all" : category })
                }
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
          </div>
        </div>

        {items === null && activities.error ? (
          <ViewTransition key="error" enter="fade-in" exit="fade-out" default="none">
            <div>
              <EmptyState
                emoji="📡"
                title="Couldn't load plans"
                body={activities.error.message}
                action={<Button onClick={() => activities.refetch()}>Try again</Button>}
              />
            </div>
          </ViewTransition>
        ) : items === null ? (
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
                  searching ? `Nothing found for "${searched}"` : "Nothing matches right now"
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
        ) : searching ? (
          <ViewTransition key="search" enter="fade-in" exit="fade-out" default="none">
            <SearchResults query={searched} items={items} people={peopleFound} />
          </ViewTransition>
        ) : (
          <ViewTransition key="results" enter="fade-in" exit="fade-out" default="none">
            <HomeSections
              items={items}
              user={user ?? null}
              city={city}
              view={view}
              onView={setView}
            />
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

      <FiltersSheet
        open={sheet === "filters"}
        onClose={() => setSheet(null)}
        picked={picked}
        update={update}
        reset={() => setPicked({ ...NO_FILTERS, category: picked.category })}
      />
    </div>
  );
}
