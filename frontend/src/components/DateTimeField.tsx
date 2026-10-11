"use client";

import "react-day-picker/style.css";
import { useId, useState } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarIcon } from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { now } from "@/lib/time";

const STEP_MINUTES = 15;

// "19:00" -> "7:00 PM"
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const TIME_OPTIONS: SelectOption<string>[] = Array.from(
  { length: (24 * 60) / STEP_MINUTES },
  (_, i) => {
    const minutes = i * STEP_MINUTES;
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return { value, label: timeLabel(value) };
  },
);

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Local date -> "2026-10-04"
function dateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A date and a time, kept as the "YYYY-MM-DDTHH:MM" string datetime-local
// uses so the form model and drafts stay unchanged. The calendar is
// react-day-picker; the time is a 15-minute select.
export function DateTimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [datePart, timePart = "19:00"] = value.split("T");
  const selected = datePart ? new Date(`${datePart}T12:00`) : undefined;
  const today = new Date(now());
  today.setHours(0, 0, 0, 0);

  const pickDay = (day: Date | undefined) => {
    if (!day) return;
    onChange(`${dateKey(day)}T${timePart}`);
    setOpen(false);
  };

  return (
    <div>
      <p id={id} className="mb-1 text-sm font-medium text-body">
        {label}
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
        <button
          type="button"
          aria-labelledby={id}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-11 items-center gap-2 rounded-2xl border bg-surface/50 px-3 text-left text-base text-ink shadow-sm transition duration-200 hover:bg-surface-hi ${
            error ? "border-red-400" : "border-line"
          }`}
        >
          <CalendarIcon className="h-5 w-5 shrink-0 text-brand-700" />
          {selected ? DAY_LABEL.format(selected) : "Pick a date"}
        </button>
        <SelectMenu
          variant="field"
          label="Time"
          value={timePart}
          onChange={(time) => onChange(`${datePart || dateKey(today)}T${time}`)}
          options={TIME_OPTIONS}
          className="[&>label]:sr-only"
        />
      </div>
      {open && (
        <div className="animate-rise mt-2 inline-block rounded-3xl border border-line bg-surface p-3 shadow-xl">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={pickDay}
            disabled={{ before: today }}
            defaultMonth={selected ?? today}
            weekStartsOn={1}
          />
        </div>
      )}
      {error && <p className="mt-1 animate-rise text-sm text-red-400">{error}</p>}
    </div>
  );
}
