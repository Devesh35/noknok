import { placeText } from "@/lib/activity";
import type { Activity } from "@/lib/types";

type CalendarEvent = Pick<
  Activity,
  "id" | "title" | "description" | "venueName" | "address" | "city" | "startsAt" | "endsAt"
>;

// 2026-10-04T14:30:00.000Z -> 20261004T143000Z
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

export function buildIcs(event: CalendarEvent, url: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NokNok//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@noknok`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(`${event.description}\n\n${url}`)}`,
    `LOCATION:${escapeText(placeText(event))}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(event: CalendarEvent, url: string) {
  const blob = new Blob([buildIcs(event, url)], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function googleCalendarUrl(event: CalendarEvent, url: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
    details: `${event.description}\n\n${url}`,
    location: placeText(event),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
