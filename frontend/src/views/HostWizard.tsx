"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useState } from "react";
import {
  activityById,
  breakdownFor,
  createActivity,
  goingJoins,
  me,
  updateActivity,
  useDb,
  type ActivityInput,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Input, Textarea } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Skeleton } from "@/components/Skeleton";
import {
  CATEGORIES,
  CATEGORY_META,
  COVER_PRESETS,
  VISIBILITIES,
  VISIBILITY_META,
} from "@/lib/activity";
import { formatInr } from "@/lib/format";
import { DAY_MS, HOUR_MS, now } from "@/lib/time";
import { toast } from "@/lib/toast";
import {
  CITIES,
  type Activity,
  type Category,
  type City,
  type Db,
  type User,
  type Visibility,
  type WaitlistMode,
} from "@/lib/types";

const DRAFT_KEY = "noknok.draft.activity";
const STEPS = ["Basics", "When & where", "Price & spots", "Who can see it", "Preview"];
const LAST_STEP = STEPS.length - 1;

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
const WAITLIST_OPTIONS: SelectOption<WaitlistMode>[] = [
  { value: "auto", label: "Next in line gets the spot automatically" },
  { value: "approval", label: "I approve who gets a free spot" },
];
const CUTOFF_OPTIONS: SelectOption<string>[] = [
  { value: "0", label: "Any time before it starts" },
  { value: "6", label: "Up to 6 hours before" },
  { value: "24", label: "Up to 24 hours before" },
  { value: "48", label: "Up to 48 hours before" },
];
const VISIBILITY_HELP: Record<Visibility, string> = {
  open: "Anyone on NokNok can find and join it.",
  friends: "Only your friends see the details. Others see a locked card.",
  friends_of_friends: "Your friends, and anyone who shares a friend with you.",
};

// Everything is kept as strings while editing; converted on publish.
interface Form {
  title: string;
  category: Category | "";
  description: string;
  coverUrl: string;
  start: string; // datetime-local value
  end: string;
  venueName: string;
  address: string;
  city: City | "";
  price: string;
  capacity: string;
  refundCutoffHours: string;
  waitlistMode: WaitlistMode;
  visibility: Visibility;
  rules: string; // one per line
}

type FormErrors = Partial<Record<keyof Form, string>>;

// Date -> "2026-10-04T19:00" in local time, the format datetime-local uses.
function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function blankForm(city: City): Form {
  const start = new Date(now() + DAY_MS);
  start.setHours(19, 0, 0, 0);
  return {
    title: "",
    category: "",
    description: "",
    coverUrl: COVER_PRESETS[0].url,
    start: toLocalInput(start.getTime()),
    end: toLocalInput(start.getTime() + 3 * HOUR_MS),
    venueName: "",
    address: "",
    city,
    price: "0",
    capacity: "10",
    refundCutoffHours: "24",
    waitlistMode: "auto",
    visibility: "open",
    rules: "",
  };
}

function formFrom(activity: Activity): Form {
  return {
    title: activity.title,
    category: activity.category,
    description: activity.description,
    coverUrl: activity.coverUrl ?? COVER_PRESETS[0].url,
    start: toLocalInput(Date.parse(activity.startsAt)),
    end: toLocalInput(Date.parse(activity.endsAt)),
    venueName: activity.venueName,
    address: activity.address,
    city: activity.city,
    price: String(activity.priceInr),
    capacity: String(activity.capacity),
    refundCutoffHours: String(activity.refundCutoffHours),
    waitlistMode: activity.waitlistMode,
    visibility: activity.visibility,
    rules: activity.tags.join("\n"),
  };
}

function loadDraft(): Partial<Form> {
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as Partial<Form>;
  } catch {
    return {};
  }
}

function validate(step: number, form: Form, minCapacity: number): FormErrors {
  const errors: FormErrors = {};
  if (step === 0) {
    if (form.title.trim().length < 4) errors.title = "Give it a title of at least 4 characters";
    if (!form.category) errors.category = "Pick a category";
    if (form.description.trim().length < 20) {
      errors.description = "Describe it in at least 20 characters so people know what to expect";
    }
  } else if (step === 1) {
    const start = Date.parse(form.start);
    const end = Date.parse(form.end);
    if (Number.isNaN(start)) errors.start = "Pick a start date and time";
    else if (start < now()) errors.start = "The start must be in the future";
    if (Number.isNaN(end)) errors.end = "Pick an end date and time";
    else if (end <= start) errors.end = "The end must be after the start";
    if (!form.venueName.trim()) errors.venueName = "Name the place";
    if (!form.address.trim()) errors.address = "Add an address people can navigate to";
    if (!form.city) errors.city = "Pick a city";
  } else if (step === 2) {
    const price = Number(form.price);
    const capacity = Number(form.capacity);
    if (form.price === "" || !Number.isInteger(price) || price < 0) {
      errors.price = "Enter a whole number of rupees, or 0 for free";
    }
    if (!Number.isInteger(capacity) || capacity < 1) errors.capacity = "Enter at least 1 spot";
    else if (capacity < minCapacity) {
      errors.capacity = `${minCapacity} people have already joined, so it can't be lower`;
    }
  }
  return errors;
}

function toInput(form: Form): ActivityInput {
  return {
    title: form.title.trim(),
    category: form.category as Category,
    description: form.description.trim(),
    coverUrl: form.coverUrl,
    venueName: form.venueName.trim(),
    address: form.address.trim(),
    city: form.city as City,
    startsAt: new Date(form.start).toISOString(),
    endsAt: new Date(form.end).toISOString(),
    priceInr: Number(form.price),
    capacity: Number(form.capacity),
    visibility: form.visibility,
    tags: form.rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    waitlistMode: form.waitlistMode,
    refundCutoffHours: Number(form.refundCutoffHours),
  };
}

function WizardForm({
  db,
  host,
  editing,
}: {
  db: Db;
  host: User;
  editing: Activity | undefined;
}) {
  const router = useRouter();
  const [form, patch] = useReducer(
    (current: Form, change: Partial<Form>) => ({ ...current, ...change }),
    undefined,
    () => (editing ? formFrom(editing) : { ...blankForm(host.city), ...loadDraft() }),
  );
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);

  // Autosave new activities so a refresh or a detour doesn't lose the work.
  useEffect(() => {
    if (editing) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // Draft autosave is best effort.
    }
  }, [form, editing]);

  const minCapacity = editing ? goingJoins(db, editing.id).length : 0;
  const errors = attempted ? validate(step, form, minCapacity) : {};

  const next = () => {
    if (Object.keys(validate(step, form, minCapacity)).length > 0) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  };

  const publish = () => {
    const input = toInput(form);
    if (editing) {
      updateActivity(editing.id, input);
      toast("Changes saved");
      router.replace(`/host/${editing.id}`);
    } else {
      const activity = createActivity(input);
      window.localStorage.removeItem(DRAFT_KEY);
      toast("Your activity is live 🎉");
      router.replace(`/host/${activity.id}`);
    }
  };

  const discardDraft = () => {
    window.localStorage.removeItem(DRAFT_KEY);
    patch(blankForm(host.city));
    setStep(0);
    setAttempted(false);
    toast("Draft cleared");
  };

  const preview: Activity | null =
    step === LAST_STEP
      ? {
          ...toInput(form),
          id: editing?.id ?? "preview",
          hostId: host.id,
          status: "active",
          inviteToken: "",
          shortCode: "",
          createdAt: "",
        }
      : null;
  const price = preview ? breakdownFor(db, preview) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="text-sm font-semibold text-brand-700">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {editing ? "Edit activity" : "Host an activity"} · {STEPS[step]}
      </h1>
      <div
        role="progressbar"
        aria-label="Wizard progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-600 to-accent transition-[width] duration-500 ease-out-soft"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div key={step} className="glass-card stagger mt-6 space-y-4 rounded-[2rem] p-4 md:p-6">
        {step === 0 && (
          <>
            <Input
              label="Title"
              value={form.title}
              maxLength={60}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Sunday 5-a-side football"
              error={errors.title}
            />
            <div>
              <p className="mb-1 text-sm font-medium text-body">Category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <Chip
                    key={category}
                    selected={form.category === category}
                    onClick={() => patch({ category })}
                  >
                    <span aria-hidden="true">{CATEGORY_META[category].emoji}</span>
                    {CATEGORY_META[category].label}
                  </Chip>
                ))}
              </div>
              {errors.category && (
                <p className="mt-1 animate-rise text-sm text-red-400">{errors.category}</p>
              )}
            </div>
            <Textarea
              label="Description"
              value={form.description}
              onChange={(event) => patch({ description: event.target.value })}
              placeholder="What's the plan, who is it for, and what's included?"
              error={errors.description}
            />
            <div>
              <p className="mb-1 text-sm font-medium text-body">Cover photo</p>
              <div className="grid grid-cols-4 gap-2">
                {COVER_PRESETS.map((cover) => (
                  <button
                    key={cover.url}
                    type="button"
                    aria-label={cover.label}
                    aria-pressed={form.coverUrl === cover.url}
                    onClick={() => patch({ coverUrl: cover.url })}
                    className={`overflow-hidden rounded-2xl border-2 transition duration-200 active:scale-95 ${
                      form.coverUrl === cover.url
                        ? "border-brand-600 shadow-lg shadow-brand-600/30"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.url} alt="" className="h-16 w-full object-cover md:h-20" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Starts"
                type="datetime-local"
                value={form.start}
                onChange={(event) => patch({ start: event.target.value })}
                error={errors.start}
              />
              <Input
                label="Ends"
                type="datetime-local"
                value={form.end}
                min={form.start}
                onChange={(event) => patch({ end: event.target.value })}
                error={errors.end}
              />
            </div>
            <Input
              label="Venue name"
              value={form.venueName}
              onChange={(event) => patch({ venueName: event.target.value })}
              placeholder="Kick Arena Turf"
              error={errors.venueName}
            />
            <Input
              label="Address"
              value={form.address}
              autoComplete="street-address"
              onChange={(event) => patch({ address: event.target.value })}
              placeholder="Street, area, pin code"
              error={errors.address}
            />
            <SelectMenu
              variant="field"
              label="City"
              value={form.city}
              onChange={(city) => patch({ city })}
              options={CITY_OPTIONS}
              error={errors.city}
            />
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Price per person"
                prefix="₹"
                inputMode="numeric"
                value={form.price}
                onChange={(event) => patch({ price: event.target.value.replace(/\D/g, "") })}
                error={errors.price}
              />
              <Input
                label="Spots"
                inputMode="numeric"
                value={form.capacity}
                onChange={(event) => patch({ capacity: event.target.value.replace(/\D/g, "") })}
                error={errors.capacity}
              />
            </div>
            <p className="text-xs text-muted">
              Enter 0 to make it free. NokNok collects ticket money and pays you two days after the
              activity ends.
            </p>
            <SelectMenu
              variant="field"
              label="Free cancellation for joiners"
              value={form.refundCutoffHours}
              onChange={(refundCutoffHours) => patch({ refundCutoffHours })}
              options={CUTOFF_OPTIONS}
            />
            <SelectMenu
              variant="field"
              label="When it's full and someone leaves"
              value={form.waitlistMode}
              onChange={(waitlistMode) => patch({ waitlistMode })}
              options={WAITLIST_OPTIONS}
            />
          </>
        )}

        {step === 3 && (
          <>
            <div role="radiogroup" aria-label="Who can see it" className="space-y-2">
              {VISIBILITIES.map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  role="radio"
                  aria-checked={form.visibility === visibility}
                  onClick={() => patch({ visibility })}
                  className={`flex w-full items-center gap-3 rounded-3xl border-2 p-4 text-left transition duration-200 active:scale-[0.99] ${
                    form.visibility === visibility
                      ? "border-brand-600 bg-brand-600/8"
                      : "border-line bg-surface/50 hover:bg-surface-hi"
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {VISIBILITY_META[visibility].emoji}
                  </span>
                  <span>
                    <span className="block font-semibold text-ink">
                      {VISIBILITY_META[visibility].label}
                    </span>
                    <span className="block text-sm text-soft">{VISIBILITY_HELP[visibility]}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Whatever you choose, your invite link lets the people you send it to see and join.
            </p>
            <Textarea
              label="What to bring / rules (optional)"
              hint="One per line."
              value={form.rules}
              onChange={(event) => patch({ rules: event.target.value })}
              placeholder={"Bring turf shoes\nCarry water"}
            />
          </>
        )}

        {preview && price && (
          <>
            <ActivityCard activity={preview} going={minCapacity} host={host} preview />
            <dl className="space-y-1 text-sm text-body">
              <div className="flex justify-between gap-4">
                <dt>Joiners pay</dt>
                <dd className="font-semibold">{price.total === 0 ? "Free" : formatInr(price.total)}</dd>
              </div>
              {price.ticket > 0 && (
                <div className="flex justify-between gap-4">
                  <dt>You receive per ticket</dt>
                  <dd className="font-semibold">{formatInr(price.hostReceives)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt>Visible to</dt>
                <dd className="font-semibold">{VISIBILITY_META[preview.visibility].label}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < LAST_STEP ? (
          <Button className="flex-1" onClick={next}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" onClick={publish}>
            {editing ? "Save changes" : "Publish"}
          </Button>
        )}
      </div>
      {!editing && (
        <p className="mt-2 text-center text-xs text-muted">
          Your draft saves automatically.{" "}
          <button type="button" onClick={discardDraft} className="min-h-11 font-semibold text-brand-700 hover:underline">
            Start over
          </button>
        </p>
      )}
    </div>
  );
}

// /host/new and /host/:id/edit.
export function HostWizard({ activityId }: { activityId?: string }) {
  const db = useDb();
  if (!db) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full rounded-[2rem]" />
      </div>
    );
  }

  const host = me(db);
  if (!host) {
    const next = activityId ? `/host/${activityId}/edit` : "/host/new";
    return (
      <EmptyState
        emoji="📣"
        title="Log in to host"
        body="You need an account so people know who's hosting."
        action={
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("primary")}>
            Log in
          </Link>
        }
      />
    );
  }

  const editing = activityId ? activityById(db, activityId) : undefined;
  if (activityId && (!editing || editing.hostId !== host.id || editing.status !== "active")) {
    return (
      <EmptyState
        emoji="🕵️"
        title="Nothing to edit here"
        body="This activity doesn't exist, was cancelled, or isn't yours."
        action={
          <Link href="/host" className={buttonClass("primary")}>
            Your hosting
          </Link>
        }
      />
    );
  }

  return <WizardForm key={activityId ?? "new"} db={db} host={host} editing={editing} />;
}
