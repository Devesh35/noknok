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
  useSession,
} from "@/api";
import {
  FOCUS_SEARCH_EVENT,
  HeaderAccount,
  Logo,
  UnreadDot,
} from "@/components/AppShell";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import {
  BellIcon,
  GridIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { ActivityCardSkeleton } from "@/components/Skeleton";
import { CATEGORIES, CATEGORY_META } from "@/lib/activity";
import { isSameDay } from "@/lib/format";
import { now } from "@/lib/time";
import { CITIES, type City } from "@/lib/types";
import {
  activeCount,
  FiltersSheet,
  NO_FILTERS,
  toListQuery,
  type Filters,
} from "@/views/HomeFilters";
import {
  HostCard,
  PeopleNearYou,
  WeekStrip,
  YourPlans,
} from "@/views/HomeRail";
import { GRID, HomeSections, SearchResults } from "@/views/HomeRows";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({
  value: city,
  label: city,
}));
const DEFAULT_CITY: City = "Ulhasnagar";
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_MAX = 80; // activityListQuery.q in src/lib/schemas.ts

function isCity(value: string | null): value is City {
  return CITIES.includes(value as City);
}

// Reads the stored city once hydration is done; the server render can't know it.
const noSubscribe = () => () => {};
function useStoredCity(): City | null {
  const stored = useSyncExternalStore(
    noSubscribe,
    getPreferredCity,
    () => null,
  );
  return isCity(stored) ? stored : null;
}

function greeting(): string {
  const hour = new Date(now()).getHours();
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

// Focuses the search box when arriving via the header search (/?search=1).
function SearchFocus({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
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

// Night sky behind the greeting: gradient, stars, a moon and a ridge line,
// all CSS so it costs no image request.
function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden rounded-[2rem]"
    >
      <div className="absolute inset-0 bg-linear-to-br from-[#2a1d6b] via-[#4a2a9a] to-[#1b1540]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(255_255_255/0.08)_0,transparent_35%),radial-gradient(circle_at_70%_10%,rgb(255_255_255/0.06)_0,transparent_30%)]" />
      {/* Crescent: one disc, lit by an inset shadow from its lower-left,
          with a soft glow behind it. */}
      <span className="absolute top-3 right-4 h-14 w-14 rounded-full bg-violet-200/60 blur-[10px] md:top-5 md:right-[7%] md:h-28 md:w-28 md:bg-violet-200/80 md:shadow-[0_0_50px_14px_rgb(196_181_253/0.3)] md:blur-[14px]" />
      <span className="absolute top-3 right-4 h-14 w-14 rounded-full shadow-[inset_-15px_-4px_0_0_rgb(243_232_255)] md:top-5 md:right-[7%] md:h-28 md:w-28 md:shadow-[inset_-30px_-8px_0_0_rgb(243_232_255)]" />
      {[
        ["58%", "18%"],
        ["66%", "52%"],
        ["74%", "30%"],
        ["84%", "70%"],
        ["50%", "66%"],
        ["90%", "12%"],
      ].map(([left, top], i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-white/80 animate-float"
          style={{ left, top, animationDelay: `${i * 0.7}s` }}
        />
      ))}
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[45%] w-full"
      >
        <path
          d="M0 200V120C120 90 220 60 340 80S560 150 700 110 900 20 1040 60 1200 110 1200 110V200z"
          fill="rgb(16 12 40 / 0.9)"
        />
        <path
          d="M0 200V160C180 140 300 120 460 140S760 190 920 150 1200 150 1200 150V200z"
          fill="rgb(9 10 18 / 0.95)"
        />
      </svg>
    </div>
  );
}

export function HomeView() {
  const { me: user } = useMe();
  const { data: session } = useSession();
  const unread = session?.unread ?? 0;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(NO_FILTERS);
  const [chosenCity, setChosenCity] = useState<City | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState<"filters" | null>(null);
  // While the filter sheet is open the list keeps the filters it had when the
  // sheet opened: a list that re-animates behind the sheet would paint its
  // view transition above it. Changes land when the sheet closes.
  const [held, setHeld] = useState<Filters | null>(null);
  const openFilters = () => {
    setHeld(picked);
    setSheet("filters");
  };
  const closeFilters = () => {
    setHeld(null);
    setSheet(null);
  };
  const [day, setDay] = useState<Date | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Controls respond instantly; the result list follows as a transition so
  // cards animate to their new places. Typing stays un-animated.
  const applied = useDeferredValue(held ?? picked);
  const trimmedQuery = query.trim();
  const searched = useDebounced(trimmedQuery);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
      window.removeEventListener("keydown", shortcut);
    };
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
  // The map view pins plans in all four cities; the list stays on one.
  const activities = useActivities(
    {
      ...toListQuery(applied, city, searched),
      ...(view === "map" ? { city: undefined } : {}),
    },
    true,
  );
  const people = usePeople(searched);
  const fetched = activities.data?.items ?? null;
  // Only offer categories that have plans; keep the selected one so it can be
  // cleared even when its last plan has gone.
  const available = activities.data?.categories ?? [];
  const chips = CATEGORIES.filter(
    (category) => available.includes(category) || category === picked.category,
  );

  const update = (patch: Partial<Filters>) =>
    setPicked((current) => ({ ...current, ...patch }));
  const clear = () => {
    setPicked(NO_FILTERS);
    setQuery("");
    setDay(null);
  };

  // A day picked on the calendar narrows the fetched list locally.
  const items =
    fetched && day
      ? fetched.filter((item) =>
          isSameDay(new Date(item.activity.startsAt), day),
        )
      : fetched;
  const peopleFound = people.data?.items ?? [];
  const searching = searched.length > 0;
  const nothingFound =
    items !== null &&
    (searching
      ? items.every((item) => item.locked) && peopleFound.length === 0
      : items.length === 0);
  const filterCount = activeCount(picked) + (day ? 1 : 0);

  const cityMenu = (className: string) => (
    <SelectMenu
      label="City"
      icon="📍"
      value={city}
      onChange={pickCity}
      options={CITY_OPTIONS}
      align="end"
      className={className}
    />
  );
  const chipRow = (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:px-0">
      <Chip
        selected={picked.category === "all"}
        onClick={() => update({ category: "all" })}
      >
        <GridIcon className="h-4 w-4" />
        All
      </Chip>
      {chips.map((category) => (
        <Chip
          key={category}
          selected={picked.category === category}
          onClick={() =>
            update({
              category: picked.category === category ? "all" : category,
            })
          }
        >
          <span aria-hidden="true">{CATEGORY_META[category].emoji}</span>
          {CATEGORY_META[category].label}
        </Chip>
      ))}
    </div>
  );
  const filtersChip = (
    <Chip selected={filterCount > 0} onClick={openFilters}>
      <SlidersIcon className="h-4 w-4" />
      Filters{filterCount > 0 ? ` (${filterCount})` : ""}
    </Chip>
  );
  const searchBox = (
    <div className="relative w-full">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-faint" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        maxLength={SEARCH_MAX}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search plans, places, people…"
        aria-label="Search plans, places and people"
        className="min-h-11 w-full rounded-full border border-line bg-surface/60 pr-16 pl-11 text-base shadow-sm outline-none transition duration-200 placeholder:text-faint focus:border-brand-600 focus:bg-surface-hi focus:ring-4 focus:ring-brand-600/15 max-md:pr-12"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-line bg-canvas-2 px-1.5 py-0.5 font-sans text-[11px] text-soft md:block">
        Ctrl K
      </kbd>
      <button
        type="button"
        onClick={openFilters}
        aria-label={`Filters${filterCount > 0 ? ` (${filterCount} on)` : ""}`}
        className={`absolute top-1/2 right-1.5 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full md:hidden ${
          filterCount > 0 ? "bg-brand-600 text-white" : "text-soft"
        }`}
      >
        <SlidersIcon className="h-5 w-5" />
      </button>
    </div>
  );

  let body;
  if (items === null && activities.error) {
    body = (
      <ViewTransition
        key="error"
        enter="fade-in"
        exit="fade-out"
        default="none"
      >
        <div>
          <EmptyState
            emoji="📡"
            title="Couldn't load plans"
            body={activities.error.message}
            action={
              <Button onClick={() => activities.refetch()}>Try again</Button>
            }
          />
        </div>
      </ViewTransition>
    );
  } else if (items === null) {
    body = (
      <ViewTransition key="skeleton" exit="fade-out" default="none">
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, index) => (
            <ActivityCardSkeleton key={index} />
          ))}
        </div>
      </ViewTransition>
    );
  } else if (nothingFound) {
    body = (
      <ViewTransition
        key="empty"
        enter="fade-in"
        exit="fade-out"
        default="none"
      >
        <div>
          <EmptyState
            emoji="🔍"
            title={
              searching
                ? `Nothing found for "${searched}"`
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
    );
  } else if (searching) {
    body = (
      <ViewTransition
        key="search"
        enter="fade-in"
        exit="fade-out"
        default="none"
      >
        <SearchResults
          query={searched}
          items={items}
          people={peopleFound}
          user={user ?? null}
        />
      </ViewTransition>
    );
  } else {
    body = (
      <ViewTransition
        key="results"
        enter="fade-in"
        exit="fade-out"
        default="none"
      >
        <HomeSections
          items={items}
          user={user ?? null}
          city={city}
          view={view}
          onView={setView}
        />
      </ViewTransition>
    );
  }

  return (
    <div>
      <Suspense fallback={null}>
        <SearchFocus inputRef={searchRef} />
      </Suspense>

      {/* ---------- Phones: logo, city and bell; then the search ---------- */}
      <div className="flex items-center gap-2 px-4 pt-3 md:hidden">
        <Logo className="text-2xl" />
        {cityMenu("ml-auto font-semibold")}
        {user && (
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-soft"
          >
            <BellIcon className="h-6 w-6" />
            <UnreadDot count={unread} className="top-0.5 right-0.5" />
          </Link>
        )}
      </div>
      <div className="px-4 pt-3 md:hidden">{searchBox}</div>
      {chips.length > 0 && <div className="px-4 pt-3 md:hidden">{chipRow}</div>}

      {/* ---------- Desktop: one sticky bar ---------- */}
      <div className="glass sticky top-0 z-30 hidden border-x-0 border-t-0 md:block">
        <div className="flex min-h-16 items-center gap-3 px-6 py-2">
          {session !== undefined && !user && <Logo className="shrink-0" />}
          <div className="w-full max-w-xl">{searchBox}</div>
          <div className="ml-auto flex items-center gap-2">
            {cityMenu("font-semibold")}
            <HeaderAccount />
          </div>
        </div>
      </div>

      <div className="px-4 py-4 md:px-8 md:py-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
        <div className="min-w-0 space-y-6">
          {/* Hero */}
          <section className="relative isolate overflow-hidden rounded-[2rem] px-5 py-6 md:px-8 md:py-8">
            <HeroArt />
            <div className="relative">
              {user && (
                <p className="text-sm font-medium text-violet-200">
                  {greeting()}, {user.name.split(" ")[0]} 👋
                </p>
              )}
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                What are you up for?
              </h1>
              <p className="mt-1 text-base text-violet-200/90">
                Discover and join hangouts around you
              </p>
              <div className="mt-5 hidden items-center gap-3 md:flex">
                <div className="min-w-0 flex-1">{chipRow}</div>
                {filtersChip}
              </div>
              <div className="mt-4 md:hidden">{filtersChip}</div>
            </div>
          </section>

          {body}
        </div>

        {/* ---------- Right rail (wide screens) ---------- */}
        <aside className="mt-6 space-y-4 max-xl:hidden xl:mt-0">
          <HostCard />
          <WeekStrip selected={day} onSelect={setDay} />
          <YourPlans items={fetched ?? []} user={user ?? null} />
          <PeopleNearYou items={fetched ?? []} user={user ?? null} />
        </aside>
      </div>

      {user && (
        <Link
          href="/host/quick"
          className="fixed right-4 bottom-24 z-30 hidden min-h-12 animate-pop items-center gap-1 rounded-full bg-brand-600 px-5 text-sm font-bold text-white shadow-xl shadow-brand-600/40 transition duration-200 active:scale-95 md:bottom-8 md:inline-flex xl:hidden"
        >
          <PlusIcon className="h-5 w-5" />
          Quick plan
        </Link>
      )}

      <FiltersSheet
        open={sheet === "filters"}
        onClose={closeFilters}
        picked={picked}
        update={update}
        reset={() => {
          setPicked({ ...NO_FILTERS, category: picked.category });
          setDay(null);
          closeFilters();
        }}
      />
    </div>
  );
}
