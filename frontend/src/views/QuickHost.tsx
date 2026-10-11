"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createQuickPlan, useMe } from "@/api";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Skeleton } from "@/components/Skeleton";
import { areasFor, CATEGORIES, CATEGORY_META, SUBCATEGORIES } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import { toast } from "@/lib/toast";
import { CITIES, type Category, type City } from "@/lib/types";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
function areaOptions(city: City): SelectOption<string>[] {
  return [
    { value: "", label: `Anywhere in ${city}` },
    ...areasFor(city).map((area) => ({ value: area, label: area })),
  ];
}
const NEED_OPTIONS = [1, 2, 3, 4, 6, 8];
const MAX_NEED = 50;
const SATURDAY = 6;

type When = "tonight" | "tomorrow" | "weekend" | "custom";

// Start time for each shortcut, as an ISO string.
function startFor(when: When, custom: string): string {
  const date = new Date(now());
  if (when === "custom") return custom ? new Date(custom).toISOString() : "";
  if (when === "tonight") {
    // "Tonight" after 7 PM means an hour from now.
    if (date.getHours() >= 19) return new Date(now() + 60 * 60 * 1000).toISOString();
    date.setHours(20, 0, 0, 0);
  } else if (when === "tomorrow") {
    date.setTime(date.getTime() + DAY_MS);
    date.setHours(19, 0, 0, 0);
  } else {
    const daysToSaturday = (SATURDAY - date.getDay() + 7) % 7 || 7;
    date.setTime(date.getTime() + daysToSaturday * DAY_MS);
    date.setHours(17, 0, 0, 0);
  }
  return date.toISOString();
}

// Value for <input type="datetime-local">, in local time.
function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const WHEN_LABELS: Record<When, string> = {
  tonight: "Tonight",
  tomorrow: "Tomorrow evening",
  weekend: "Saturday",
  custom: "Pick a date",
};

// /host/quick: four answers and you have a plan. For everything else
// (price, privacy, rules) there is the full wizard.
function QuickForm({ defaultCity }: { defaultCity: City }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [when, setWhen] = useState<When>("tonight");
  const [custom, setCustom] = useState(() => toLocalInput(now() + DAY_MS));
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState<City>(defaultCity);
  const [area, setArea] = useState("");
  const [need, setNeed] = useState(2);
  const [needText, setNeedText] = useState("2");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const startsAt = startFor(when, custom);
  const errors = {
    title: title.trim().length >= 3 ? "" : "Say what you're planning",
    category: category ? "" : "Pick one",
    subcategory: !category || subcategory ? "" : "Pick one",
    when:
      !startsAt
        ? "Pick a date and time"
        : Date.parse(startsAt) < now()
          ? "That's in the past"
          : "",
    venueName: venueName.trim() ? "" : "Say where",
    need: need >= 1 && need <= MAX_NEED ? "" : `Between 1 and ${MAX_NEED}`,
  };
  const show = (error: string) => (submitted && error ? error : undefined);

  const pickNeed = (value: number) => {
    setNeed(value);
    setNeedText(String(value));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean) || busy) return;
    setBusy(true);
    const result = await createQuickPlan({
      title,
      category: category as Category,
      subcategory,
      startsAt,
      venueName,
      city,
      area: area || undefined,
      need,
    });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "NOT_LOGGED_IN") router.replace("/login?next=/host/quick");
      else toast(result.message);
      return;
    }
    toast("Your plan is live 🎉");
    router.replace(`/host/${result.data.id}`);
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto w-full max-w-xl space-y-6 px-4 py-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">Quick plan · about 20 seconds</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          Looking for people to do something with?
        </h1>
      </div>

      <div className="glass-card space-y-5 rounded-[2rem] p-4 md:p-6">
        <Input
          label="What?"
          value={title}
          maxLength={60}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Badminton doubles, dinner, a trek…"
          error={show(errors.title)}
        />
        <div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <Chip
                key={option}
                selected={category === option}
                onClick={() => {
                  setCategory(option);
                  setSubcategory("");
                }}
              >
                <span aria-hidden="true">{CATEGORY_META[option].emoji}</span>
                {CATEGORY_META[option].label}
              </Chip>
            ))}
          </div>
          {show(errors.category) && (
            <p className="mt-1 animate-rise text-sm text-red-400">{errors.category}</p>
          )}
          {category && (
            <div className="mt-3 animate-rise">
              <p className="mb-2 text-sm font-medium text-body">
                What kind of {CATEGORY_META[category].label.toLowerCase()}?
              </p>
              <div className="flex flex-wrap gap-2">
                {SUBCATEGORIES[category].map((option) => (
                  <Chip
                    key={option.value}
                    selected={subcategory === option.value}
                    onClick={() => setSubcategory(option.value)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
              {show(errors.subcategory) && (
                <p className="mt-1 animate-rise text-sm text-red-400">{errors.subcategory}</p>
              )}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-body">When?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(WHEN_LABELS) as When[]).map((option) => (
              <Chip key={option} selected={when === option} onClick={() => setWhen(option)}>
                {WHEN_LABELS[option]}
              </Chip>
            ))}
          </div>
          {when === "custom" ? (
            <div className="mt-3 animate-rise">
              <Input
                label="Date and time"
                type="datetime-local"
                value={custom}
                min={toLocalInput(now())}
                onChange={(event) => setCustom(event.target.value)}
                error={show(errors.when)}
              />
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">{formatDateTime(startsAt)}</p>
          )}
        </fieldset>

        <div className="space-y-4">
          <Input
            label="Where?"
            value={venueName}
            onChange={(event) => setVenueName(event.target.value)}
            placeholder="Venue or landmark"
            error={show(errors.venueName)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectMenu
              variant="field"
              label="City"
              value={city}
              onChange={(next) => {
                setCity(next);
                setArea("");
              }}
              options={CITY_OPTIONS}
            />
            {areasFor(city).length > 0 && (
              <SelectMenu
                variant="field"
                label="Area"
                value={area}
                onChange={setArea}
                options={areaOptions(city)}
              />
            )}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-body">How many more people?</legend>
          <div className="flex flex-wrap items-center gap-2">
            {NEED_OPTIONS.map((option) => (
              <Chip key={option} selected={need === option} onClick={() => pickNeed(option)}>
                {option}
              </Chip>
            ))}
            <div className="w-24">
              <Input
                label="Or exactly"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_NEED}
                value={needText}
                onChange={(event) => {
                  setNeedText(event.target.value);
                  setNeed(Number(event.target.value));
                }}
                error={show(errors.need)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/host")}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} className="flex-1">
          Post plan
        </Button>
      </div>
      <p className="text-center text-xs text-muted">
        Quick plans are free and open to anyone. Need a price, a private plan or rules?{" "}
        <Link href="/host/new" className="font-semibold text-brand-700 hover:underline">
          Use the full form
        </Link>
        .
      </p>
    </form>
  );
}

export function QuickHost() {
  const router = useRouter();
  const { me: host, loaded } = useMe();

  // Posting needs an account; send visitors through login and back here.
  useEffect(() => {
    if (loaded && !host) router.replace("/login?next=/host/quick");
  }, [loaded, host, router]);

  if (!loaded) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }
  if (!host) {
    return (
      <EmptyState
        emoji="🙌"
        title="Find people for your plan"
        body="Post what you're up for and let people nearby join you."
        action={
          <Link href="/login?next=/host/quick" className={buttonClass("primary")}>
            Log in to post
          </Link>
        }
      />
    );
  }
  return <QuickForm defaultCity={host.city} />;
}
