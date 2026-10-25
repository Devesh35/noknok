"use client";

// The wizard's form model: what is edited, how it is validated per step and
// how it becomes an ActivityInput. The step screens are in HostWizardStepViews.
import type { ActivityInput } from "@/api";
import { coverFor, placeNameFrom } from "@/lib/activity";
import { paiseToRupees, rupeesToPaise } from "@/lib/format";
import { DAY_MS, now } from "@/lib/time";
import type {
  Activity,
  Category,
  City,
  Setting,
  Visibility,
  WaitlistMode,
} from "@/lib/types";

// Versioned: drafts saved before the map/duration change would not load.
// Keyed by host so a shared phone never shows one person's half-written plan
// (venue, address) to whoever logs in next.
export function draftKeys(hostId: string): { form: string; step: string } {
  return {
    form: `noknok.draft.activity.v6.${hostId}`,
    // The step the draft was left on, restored only if the steps before it pass.
    step: `noknok.draft.step.v3.${hostId}`,
  };
}
export const TITLE_MAX = 60;
// Mirrors the server's activityInput limits (src/lib/schemas.ts).
export const PRICE_MAX_RUPEES = 100_000;
export const CAPACITY_MAX = 500;
// Three screens, then the plan is live: pick a type, fill in the details,
// check the preview.
export const STEPS = [
  { title: "Create activity", blurb: "What kind of hangout are you planning?" },
  { title: "Activity details", blurb: "Tell people more about your hangout" },
  { title: "Review your activity", blurb: "Make sure everything looks good" },
];
export const LAST_STEP = STEPS.length - 1;
export const STEP_TYPE = 0;
export const STEP_DETAILS = 1;

export const DURATION_OPTIONS = [
  { value: "60", label: "1 hour" },
  { value: "90", label: "1½ hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "360", label: "6 hours" },
  { value: "720", label: "Half a day" },
  { value: "1440", label: "All day" },
];

// Everything is kept as strings while editing; converted on publish. Price is
// whole rupees here and becomes paise in toInput().
export interface Form {
  title: string;
  description: string;
  category: Category | "";
  subcategory: string;
  coverUrl: string;
  // Set once the host has confirmed or changed the guessed category, so a
  // later edit to the title doesn't silently overwrite their choice.
  categoryConfirmed: boolean;
  start: string; // "YYYY-MM-DDTHH:MM" local
  durationMinutes: string;
  venueName: string;
  address: string;
  city: City | "";
  area: string; // locality within the city
  lat?: number;
  lng?: number;
  setting: Setting;
  beginnerFriendly: boolean;
  price: string;
  capacity: string;
  refundCutoffHours: string;
  waitlistMode: WaitlistMode;
  visibility: Visibility;
  rules: string; // one per line
}

export type FormErrors = Partial<Record<keyof Form, string>>;

// Date -> "2026-10-04T19:00" in local time.
export function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function blankForm(city: City): Form {
  const start = new Date(now() + DAY_MS);
  start.setHours(19, 0, 0, 0);
  return {
    title: "",
    description: "",
    category: "",
    subcategory: "",
    coverUrl: "", // empty = the stock cover for the chosen type
    categoryConfirmed: false,
    start: toLocalInput(start.getTime()),
    durationMinutes: "120",
    venueName: "",
    address: "",
    city,
    area: "",
    setting: "indoor",
    beginnerFriendly: true,
    price: "0",
    capacity: "10",
    refundCutoffHours: "24",
    waitlistMode: "auto",
    visibility: "open",
    rules: "",
  };
}

function nearestDuration(minutes: number): string {
  const options = DURATION_OPTIONS.map((o) => Number(o.value));
  const best = options.reduce((a, b) =>
    Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a,
  );
  return String(best);
}

export function formFrom(activity: Activity): Form {
  const start = Date.parse(activity.startsAt);
  const minutes = Math.round((Date.parse(activity.endsAt) - start) / 60_000);
  return {
    title: activity.title,
    description: activity.description,
    category: activity.category,
    subcategory: activity.subcategory,
    coverUrl: activity.coverUrl ?? "",
    categoryConfirmed: true,
    start: toLocalInput(start),
    durationMinutes: nearestDuration(minutes),
    venueName: activity.venueName,
    address: activity.address,
    city: activity.city,
    area: activity.area ?? "",
    lat: activity.lat,
    lng: activity.lng,
    setting: activity.setting,
    beginnerFriendly: activity.beginnerFriendly,
    price: String(paiseToRupees(activity.priceP)),
    capacity: String(activity.capacity),
    refundCutoffHours: String(activity.refundCutoffHours),
    waitlistMode: activity.waitlistMode,
    visibility: activity.visibility,
    rules: activity.tags.join("\n"),
  };
}

export function loadDraft(hostId: string): Partial<Form> {
  try {
    return JSON.parse(
      window.localStorage.getItem(draftKeys(hostId).form) ?? "{}",
    ) as Partial<Form>;
  } catch {
    return {};
  }
}

// The saved step, stepped back to the first earlier step that doesn't pass.
export function loadDraftStep(hostId: string, form: Form): number {
  let saved = 0;
  try {
    saved = Number(window.localStorage.getItem(draftKeys(hostId).step) ?? 0);
  } catch {
    return 0;
  }
  if (!Number.isInteger(saved) || saved < 0) return 0;
  const target = Math.min(saved, LAST_STEP);
  for (let step = 0; step < target; step++) {
    if (Object.keys(validate(step, form, 0)).length > 0) return step;
  }
  return target;
}

// The typed name, else one derived from a pinned address (drafts saved
// before the picker did this itself).
function venueNameOf(form: Form): string {
  return (
    form.venueName.trim() ||
    (form.lat !== undefined ? placeNameFrom(form.area, form.address) : "")
  );
}

export function validate(
  step: number,
  form: Form,
  minCapacity: number,
): FormErrors {
  const errors: FormErrors = {};
  if (step === STEP_TYPE) {
    if (!form.category) errors.category = "Pick a category";
    if (form.category && !form.subcategory)
      errors.subcategory = "Pick a subcategory";
  } else if (step === STEP_DETAILS) {
    if (form.title.trim().length < 4)
      errors.title = "Give it a title of at least 4 characters";
    if (form.description.trim().length < 20) {
      errors.description =
        "Describe it in at least 20 characters so people know what to expect";
    }
    const start = Date.parse(form.start);
    if (Number.isNaN(start)) errors.start = "Pick a date and time";
    else if (start < now()) errors.start = "The start must be in the future";
    if (!venueNameOf(form))
      errors.venueName = "Name the place, or pick it on the map";
    if (!form.address.trim())
      errors.address = "Add an address people can navigate to";
    if (!form.city)
      errors.city =
        "NokNok is only in Ulhasnagar, Ambernath, Vitthalwadi and Kalyan for now";
    const price = Number(form.price);
    const capacity = Number(form.capacity);
    if (form.price === "" || !Number.isInteger(price) || price < 0) {
      errors.price = "Enter a whole number of rupees, or 0 for free";
    } else if (price > PRICE_MAX_RUPEES) {
      errors.price = "The most a ticket can cost is ₹1,00,000";
    }
    if (!Number.isInteger(capacity) || capacity < 1)
      errors.capacity = "Enter at least 1 spot";
    else if (capacity > CAPACITY_MAX)
      errors.capacity = `A plan can have at most ${CAPACITY_MAX} spots`;
    else if (capacity < minCapacity) {
      errors.capacity = `${minCapacity} people have already joined, so it can't be lower`;
    }
  }
  return errors;
}

export function toInput(form: Form): ActivityInput {
  const start = new Date(form.start);
  const end = new Date(start.getTime() + Number(form.durationMinutes) * 60_000);
  return {
    title: form.title.trim(),
    category: form.category as Category,
    subcategory: form.subcategory,
    description: form.description.trim(),
    coverUrl:
      form.coverUrl || coverFor(form.category as Category, form.subcategory),
    venueName: venueNameOf(form),
    address: form.address.trim(),
    city: form.city as City,
    area: form.area || undefined,
    lat: form.lat,
    lng: form.lng,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    priceP: rupeesToPaise(Number(form.price)), // what a joiner pays
    capacity: Number(form.capacity),
    visibility: form.visibility,
    setting: form.setting,
    beginnerFriendly: form.beginnerFriendly,
    tags: form.rules
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    waitlistMode: form.waitlistMode,
    refundCutoffHours: Number(form.refundCutoffHours),
  };
}
