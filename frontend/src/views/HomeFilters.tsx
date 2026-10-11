"use client";

import type { ActivityListQuery } from "@/api";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Sheet } from "@/components/Sheet";
import { VISIBILITIES, VISIBILITY_META } from "@/lib/activity";
import type { Category, City, Setting, Visibility } from "@/lib/types";

export type DateFilter = ActivityListQuery["date"];

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

export interface Filters {
  category: Category | "all";
  visibility: Visibility | "all";
  date: DateFilter;
  setting: Setting | "any";
  freeOnly: boolean;
  beginnerOnly: boolean;
  showPrivate: boolean;
}

export const NO_FILTERS: Filters = {
  category: "all",
  visibility: "all",
  date: "any",
  setting: "any",
  freeOnly: false,
  beginnerOnly: false,
  showPrivate: false,
};

// Filtering is the server's job; this is the query it gets.
export function toListQuery(
  filters: Filters,
  city: City,
  query: string,
): Partial<ActivityListQuery> {
  return {
    city,
    category: filters.category === "all" ? undefined : filters.category,
    visibility: filters.visibility === "all" ? undefined : filters.visibility,
    date: filters.date,
    setting: filters.setting === "any" ? undefined : filters.setting,
    free: filters.freeOnly || undefined,
    beginner: filters.beginnerOnly || undefined,
    q: query || undefined,
    // Plans the viewer can't open stay hidden unless they ask to see them.
    includeLocked: filters.showPrivate || undefined,
  };
}

// How many filters in the sheet differ from the defaults.
export function activeCount(filters: Filters): number {
  return (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter(
    (key) => key !== "category" && filters[key] !== NO_FILTERS[key],
  ).length;
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

export function FiltersSheet({
  open,
  onClose,
  picked,
  update,
  reset,
}: {
  open: boolean;
  onClose: () => void;
  picked: Filters;
  update: (patch: Partial<Filters>) => void;
  reset: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
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
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">More</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={picked.freeOnly} onClick={() => update({ freeOnly: !picked.freeOnly })}>
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
          <Button variant="secondary" onClick={reset}>
            Reset
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Show plans
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
