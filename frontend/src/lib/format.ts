import { now as clockNow } from "@/lib/time";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "1 spot", "3 spots". Irregular plurals pass their own form.
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Refund window in words; a 0-hour cutoff means "until it starts".
export function refundWindow(cutoffHours: number): string {
  return cutoffHours <= 0
    ? "any time before it starts"
    : `up to ${plural(cutoffHours, "hour")} before the start`;
}

// Money arrives as integer paise and is turned into rupees only here.
export function formatInr(amountP: number): string {
  const rupees = amountP / 100;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPrice(priceP: number): string {
  return priceP === 0 ? "FREE" : formatInr(priceP);
}

// For inputs: paise -> "250", and back.
export function paiseToRupees(amountP: number): number {
  return amountP / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso)).toUpperCase();
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// "in 3 days", "tomorrow", "in 2 hours", "happening now", "3 days ago"
export function formatRelative(startsAt: string, endsAt: string): string {
  const now = new Date(clockNow());
  const start = new Date(startsAt);
  if (start.getTime() <= now.getTime() && now.getTime() <= new Date(endsAt).getTime()) {
    return "happening now";
  }
  const diffMs = start.getTime() - now.getTime();
  const hours = diffMs / (60 * 60 * 1000);
  if (Math.abs(hours) < 1) {
    return relativeFormat.format(Math.round(diffMs / (60 * 1000)), "minute");
  }
  if (isSameDay(start, now)) {
    return relativeFormat.format(Math.round(hours), "hour");
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return relativeFormat.format(days, "day");
}

// "just now", "5 minutes ago", "yesterday"
export function formatAgo(iso: string): string {
  const diffMs = Date.parse(iso) - clockNow();
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
  return relativeFormat.format(Math.round(hours / 24), "day");
}
