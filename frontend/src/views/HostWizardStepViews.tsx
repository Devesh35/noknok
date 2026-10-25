"use client";

import { useState } from "react";
import { Chip } from "@/components/Chip";
import { CoverPicker } from "@/components/CoverPicker";
import { Cover } from "@/components/Cover";
import { DateTimeField } from "@/components/DateTimeField";
import { Input, Textarea, Toggle } from "@/components/Field";
import { CameraIcon, ChevronDownIcon } from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { VenuePicker } from "@/components/VenuePicker";
import {
  CATEGORIES,
  CATEGORY_META,
  SUBCATEGORIES,
  VISIBILITIES,
  VISIBILITY_META,
} from "@/lib/activity";
import { breakdownForPrice } from "@/lib/fees";
import { formatInr, rupeesToPaise } from "@/lib/format";
import type { Category, DevSettings, WaitlistMode } from "@/lib/types";
import {
  DURATION_OPTIONS,
  TITLE_MAX,
  type Form,
  type FormErrors,
} from "@/views/HostWizardSteps";

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

// One line under each type on the first screen.
const CATEGORY_BLURB: Record<Category, string> = {
  sports: "Football, badminton, cricket, etc.",
  social: "Meet new people, casual hangout",
  outdoors: "Treks, walks, cycling, picnics",
  games: "Gaming, board games, esports",
  food: "Chai, dinner, cafe, food exploring",
  creative: "Art, photography, workshops",
  fitness: "Yoga, runs, gym sessions",
  music: "Jams, gigs, open mics",
  entertainment: "Movies, comedy, shows",
  event: "House party, celebration, special events",
};

const SECTION_LABEL = "text-sm font-semibold text-ink";
const ERROR = "mt-1 animate-rise text-sm text-red-400";

export interface StepProps {
  form: Form;
  patch: (change: Partial<Form>) => void;
  errors: FormErrors;
}

// Step 1: a grid of types, then the kind within the chosen type.
export function StepType({ form, patch, errors }: StepProps) {
  return (
    <>
      <div
        role="radiogroup"
        aria-label="Activity type"
        className="grid grid-cols-2 gap-3"
      >
        {CATEGORIES.map((category) => {
          const selected = form.category === category;
          return (
            <button
              key={category}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                patch({ category, subcategory: "", categoryConfirmed: true })
              }
              className={`flex min-h-32 flex-col items-center justify-center gap-1 rounded-3xl border-2 px-3 py-4 text-center transition duration-200 active:scale-[0.98] ${
                selected
                  ? "border-brand-600 bg-brand-600/10 shadow-lg shadow-brand-600/20"
                  : "border-line bg-surface/50 hover:bg-surface-hi"
              }`}
            >
              <span className="text-4xl drop-shadow" aria-hidden="true">
                {CATEGORY_META[category].emoji}
              </span>
              <span className="mt-1 font-bold text-ink">
                {CATEGORY_META[category].label}
              </span>
              <span className="text-xs leading-snug text-soft">
                {CATEGORY_BLURB[category]}
              </span>
            </button>
          );
        })}
      </div>
      {errors.category && <p className={ERROR}>{errors.category}</p>}
      {form.category && (
        <div className="animate-rise">
          <p className={`mb-2 ${SECTION_LABEL}`}>
            What kind of {CATEGORY_META[form.category].label.toLowerCase()}?
          </p>
          <div className="flex flex-wrap gap-2">
            {SUBCATEGORIES[form.category].map((option) => (
              <Chip
                key={option.value}
                selected={form.subcategory === option.value}
                onClick={() =>
                  patch({ subcategory: option.value, categoryConfirmed: true })
                }
              >
                {option.label}
              </Chip>
            ))}
          </div>
          {errors.subcategory && <p className={ERROR}>{errors.subcategory}</p>}
        </div>
      )}
    </>
  );
}

// A cover with a "Change cover" bar; the picker opens underneath on demand.
function CoverField({ form, patch }: Pick<StepProps, "form" | "patch">) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-3xl border border-line">
      <div className="group relative">
        <Cover
          activity={{
            category: (form.category || "social") as Category,
            subcategory: form.subcategory,
            coverUrl: form.coverUrl,
            title: form.title,
          }}
          className="h-40"
        />
        <span className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">
          <CameraIcon className="h-5 w-5" />
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-center gap-1 bg-surface/60 text-sm font-semibold text-ink hover:bg-surface-hi"
      >
        Change cover
        <ChevronDownIcon
          className={`h-4 w-4 transition duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="animate-rise border-t border-line p-3">
          <CoverPicker
            value={form.coverUrl}
            category={(form.category || "social") as Category}
            subcategory={form.subcategory}
            onChange={(coverUrl) => patch({ coverUrl })}
          />
        </div>
      )}
    </div>
  );
}

// Step 2: everything about the plan on one scrolling screen.
export function StepDetails({
  form,
  patch,
  errors,
  dev,
}: StepProps & { dev: DevSettings }) {
  const [more, setMore] = useState(false);
  const rupees = Number(form.price) || 0;
  const price = breakdownForPrice(
    rupeesToPaise(rupees),
    dev.feeModel,
    dev.feePercent,
  );
  const row = "flex items-center justify-between gap-4 py-1.5 text-sm";

  return (
    <>
      <CoverField form={form} patch={patch} />

      <Input
        label="Title *"
        value={form.title}
        maxLength={TITLE_MAX}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder="Rooftop house party"
        error={errors.title}
      />
      <Textarea
        label="Description *"
        value={form.description}
        rows={4}
        onChange={(event) => patch({ description: event.target.value })}
        placeholder="Chill music, good vibes and amazing people. BYOB!"
        error={errors.description}
      />

      <section className="space-y-3">
        <p className={SECTION_LABEL}>Date &amp; time *</p>
        <DateTimeField
          label="Starts"
          value={form.start}
          onChange={(start) => patch({ start })}
          error={errors.start}
        />
        <SelectMenu
          variant="field"
          label="How long"
          value={form.durationMinutes}
          onChange={(durationMinutes) => patch({ durationMinutes })}
          options={DURATION_OPTIONS}
        />
      </section>

      <section>
        <p className={`mb-2 ${SECTION_LABEL}`}>Location *</p>
        <VenuePicker
          value={{
            venueName: form.venueName,
            address: form.address,
            city: form.city,
            area: form.area,
            lat: form.lat,
            lng: form.lng,
          }}
          onChange={(change) => patch(change)}
          errors={errors}
        />
      </section>

      <section>
        <p className={`mb-2 ${SECTION_LABEL}`}>Who can join?</p>
        <div
          role="radiogroup"
          aria-label="Who can join"
          className="grid grid-cols-3 gap-2"
        >
          {VISIBILITIES.map((visibility) => {
            const selected = form.visibility === visibility;
            return (
              <button
                key={visibility}
                type="button"
                role="radio"
                aria-checked={selected}
                title={VISIBILITY_META[visibility].help}
                onClick={() => patch({ visibility })}
                className={`flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border-2 px-2 text-sm font-semibold transition duration-200 active:scale-[0.98] ${
                  selected
                    ? "border-brand-600 bg-brand-600/10 text-ink"
                    : "border-line bg-surface/50 text-soft hover:bg-surface-hi"
                }`}
              >
                <span aria-hidden="true">
                  {VISIBILITY_META[visibility].emoji}
                </span>
                <span className="truncate">
                  {VISIBILITY_META[visibility].label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          {VISIBILITY_META[form.visibility].help}
        </p>
      </section>

      <section className="space-y-3">
        <p className={SECTION_LABEL}>Price &amp; spots</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="What each person pays"
            prefix="₹"
            inputMode="numeric"
            value={form.price}
            onChange={(event) =>
              patch({ price: event.target.value.replace(/\D/g, "") })
            }
            error={errors.price}
          />
          <Input
            label="Spots"
            inputMode="numeric"
            value={form.capacity}
            onChange={(event) =>
              patch({ capacity: event.target.value.replace(/\D/g, "") })
            }
            error={errors.capacity}
          />
        </div>
        {rupees > 0 ? (
          <dl className="rounded-2xl border border-line bg-surface/50 px-4 py-2">
            <div className={`${row} text-body`}>
              <dt>Each joiner pays</dt>
              <dd className="font-semibold text-ink">
                {formatInr(price.totalP)}
              </dd>
            </div>
            <div className={`${row} text-soft`}>
              <dt>Platform fee ({dev.feePercent}%) + GST</dt>
              <dd>{formatInr(price.platformFeeP + price.gstP)}</dd>
            </div>
            <div className={`${row} border-t border-line text-body`}>
              <dt>You get per ticket</dt>
              <dd className="font-semibold text-success">
                {formatInr(price.hostReceivesP)}
              </dd>
            </div>
            <div className={`${row} text-body`}>
              <dt>If all {form.capacity || 0} spots fill</dt>
              <dd className="font-semibold text-ink">
                {formatInr(price.hostReceivesP * (Number(form.capacity) || 0))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-muted">Free plan: no fees for anyone.</p>
        )}
      </section>

      <div className="overflow-hidden rounded-2xl border border-line">
        <button
          type="button"
          onClick={() => setMore((o) => !o)}
          aria-expanded={more}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-ink hover:bg-surface-hi"
        >
          More options
          <ChevronDownIcon
            className={`h-5 w-5 text-muted transition duration-300 ${more ? "rotate-180" : ""}`}
          />
        </button>
        {more && (
          <div className="animate-rise space-y-4 border-t border-line p-4">
            <Toggle
              label="Outdoors"
              hint={
                form.setting === "outdoor"
                  ? "Open air: weather matters."
                  : "Indoors: rain or shine."
              }
              checked={form.setting === "outdoor"}
              onChange={(outdoor) =>
                patch({ setting: outdoor ? "outdoor" : "indoor" })
              }
            />
            <Toggle
              label="Beginner friendly"
              hint="First-timers are welcome and won't hold anyone back."
              checked={form.beginnerFriendly}
              onChange={(beginnerFriendly) => patch({ beginnerFriendly })}
            />
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
            <Textarea
              label="What to bring / rules (optional)"
              hint="One per line."
              value={form.rules}
              onChange={(event) => patch({ rules: event.target.value })}
              placeholder={"Bring turf shoes\nCarry water"}
            />
            <p className="text-xs text-muted">
              NokNok collects ticket money and pays you two days after the
              activity ends.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
