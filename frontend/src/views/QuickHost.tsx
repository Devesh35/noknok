"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createQuickPlan, me, useDb } from "@/api";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Skeleton } from "@/components/Skeleton";
import { CATEGORIES, CATEGORY_META } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import { toast } from "@/lib/toast";
import { CITIES, type Category, type City } from "@/lib/types";

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
const NEED_OPTIONS = [1, 2, 3, 4, 6, 8];
const SATURDAY = 6;

type When = "tonight" | "tomorrow" | "weekend";

// Start time for each shortcut, as an ISO string.
function startFor(when: When): string {
  const date = new Date(now());
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

const WHEN_LABELS: Record<When, string> = {
  tonight: "Tonight",
  tomorrow: "Tomorrow evening",
  weekend: "Saturday",
};

// /host/quick: four answers and you have a plan. For everything else
// (price, privacy, rules) there is the full wizard.
function QuickForm({ defaultCity }: { defaultCity: City }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [when, setWhen] = useState<When>("tonight");
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState<City>(defaultCity);
  const [need, setNeed] = useState(2);
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    title: title.trim().length >= 3 ? "" : "Say what you're planning",
    category: category ? "" : "Pick one",
    venueName: venueName.trim() ? "" : "Say where",
  };
  const show = (error: string) => (submitted && error ? error : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.title || errors.category || errors.venueName) return;
    const activity = createQuickPlan({
      title,
      category: category as Category,
      startsAt: startFor(when),
      venueName,
      city,
      need,
    });
    toast("Your plan is live 🎉");
    router.replace(`/host/${activity.id}`);
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
              <Chip key={option} selected={category === option} onClick={() => setCategory(option)}>
                <span aria-hidden="true">{CATEGORY_META[option].emoji}</span>
                {CATEGORY_META[option].label}
              </Chip>
            ))}
          </div>
          {show(errors.category) && (
            <p className="mt-1 animate-rise text-sm text-red-400">{errors.category}</p>
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
          <p className="mt-2 text-xs text-muted">{formatDateTime(startFor(when))}</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Input
            label="Where?"
            value={venueName}
            onChange={(event) => setVenueName(event.target.value)}
            placeholder="Venue or area"
            error={show(errors.venueName)}
          />
          <SelectMenu variant="field" label="City" value={city} onChange={setCity} options={CITY_OPTIONS} />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-body">How many more people?</legend>
          <div className="flex flex-wrap gap-2">
            {NEED_OPTIONS.map((option) => (
              <Chip key={option} selected={need === option} onClick={() => setNeed(option)}>
                {option}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>

      <Button type="submit" className="w-full">
        Post plan
      </Button>
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
  const db = useDb();
  if (!db) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }
  const host = me(db);
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
