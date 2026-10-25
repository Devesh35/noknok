"use client";

import { Chip } from "@/components/Chip";
import { CoverPicker } from "@/components/CoverPicker";
import { DateTimeField } from "@/components/DateTimeField";
import { Input, Textarea, Toggle } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { VenuePicker } from "@/components/VenuePicker";
import { CATEGORIES, CATEGORY_META, SUBCATEGORIES, VISIBILITIES, VISIBILITY_META } from "@/lib/activity";
import { breakdownForPrice } from "@/lib/fees";
import { formatInr, rupeesToPaise } from "@/lib/format";
import type { DevSettings, WaitlistMode } from "@/lib/types";
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

export interface StepProps {
  form: Form;
  patch: (change: Partial<Form>) => void;
  errors: FormErrors;
}

export function StepBasics({ form, patch, errors }: StepProps) {
  return (
    <>
      <Input
        label="Title"
        value={form.title}
        maxLength={TITLE_MAX}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder="Sunday 5-a-side football"
        error={errors.title}
      />
      <p className="-mt-3 text-right text-xs text-muted" aria-live="polite">
        {form.title.length}/{TITLE_MAX}
      </p>
      <Textarea
        label="Description"
        hint="What's the plan, who is it for, and what's included? We'll suggest a category from this."
        value={form.description}
        rows={5}
        onChange={(event) => patch({ description: event.target.value })}
        placeholder="Friendly 5-a-side on an artificial turf. Mixed skill levels, teams get shuffled…"
        error={errors.description}
      />
    </>
  );
}

// `guessed` is true when the selection came from the title and description
// rather than the host, so the screen can say so.
export function StepCategory({ form, patch, errors }: StepProps) {
  return (
    <>
      <div>
        <p className="mb-1 text-sm font-medium text-body">Category</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              selected={form.category === category}
              onClick={() => patch({ category, subcategory: "", categoryConfirmed: true })}
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
      {form.category && (
        <div className="animate-rise">
          <p className="mb-1 text-sm font-medium text-body">
            What kind of {CATEGORY_META[form.category].label.toLowerCase()}?
          </p>
          <div className="flex flex-wrap gap-2">
            {SUBCATEGORIES[form.category].map((option) => (
              <Chip
                key={option.value}
                selected={form.subcategory === option.value}
                onClick={() => patch({ subcategory: option.value, categoryConfirmed: true })}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          {errors.subcategory && (
            <p className="mt-1 animate-rise text-sm text-red-400">{errors.subcategory}</p>
          )}
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-medium text-body">Cover photo</p>
        <CoverPicker value={form.coverUrl} onChange={(coverUrl) => patch({ coverUrl })} />
      </div>
    </>
  );
}

export function StepWhenWhere({ form, patch, errors }: StepProps) {
  return (
    <>
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
      <div>
        <p className="mb-1 text-sm font-medium text-body">Where</p>
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
      </div>
      <Toggle
        label="Outdoors"
        hint={form.setting === "outdoor" ? "Open air: weather matters." : "Indoors: rain or shine."}
        checked={form.setting === "outdoor"}
        onChange={(outdoor) => patch({ setting: outdoor ? "outdoor" : "indoor" })}
      />
      <Toggle
        label="Beginner friendly"
        hint="First-timers are welcome and won't hold anyone back."
        checked={form.beginnerFriendly}
        onChange={(beginnerFriendly) => patch({ beginnerFriendly })}
      />
    </>
  );
}

// The host types what a joiner pays; the ticket price is derived from it and
// the breakdown shows what the host gets and what NokNok keeps.
export function StepPrice({ form, patch, errors, dev }: StepProps & { dev: DevSettings }) {
  const rupees = Number(form.price) || 0;
  const price = breakdownForPrice(rupeesToPaise(rupees), dev.feeModel, dev.feePercent);
  const row = "flex items-center justify-between gap-4 py-1.5 text-sm";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="What each person pays"
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
      {rupees > 0 ? (
        <dl className="rounded-2xl border border-line bg-surface/50 px-4 py-2">
          <div className={`${row} text-body`}>
            <dt>Each joiner pays</dt>
            <dd className="font-semibold text-ink">{formatInr(price.totalP)}</dd>
          </div>
          <div className={`${row} text-soft`}>
            <dt>Platform fee ({dev.feePercent}%) + GST</dt>
            <dd>{formatInr(price.platformFeeP + price.gstP)}</dd>
          </div>
          <div className={`${row} border-t border-line text-body`}>
            <dt>You get per ticket</dt>
            <dd className="font-semibold text-success">{formatInr(price.hostReceivesP)}</dd>
          </div>
          <div className={`${row} text-soft`}>
            <dt>NokNok keeps</dt>
            <dd>{formatInr(price.totalP - price.hostReceivesP)}</dd>
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
      <p className="text-xs text-muted">
        NokNok collects ticket money and pays you two days after the activity ends.
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
  );
}

export function StepWho({ form, patch }: StepProps) {
  return (
    <>
      <div role="radiogroup" aria-label="Who can join" className="space-y-2">
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
              <span className="block text-sm text-soft">{VISIBILITY_META[visibility].help}</span>
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
  );
}
