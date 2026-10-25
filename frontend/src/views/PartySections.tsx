"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { CategoryBadge, VisibilityBadge } from "@/components/Badge";
import { Button, buttonClass } from "@/components/Button";
import { CalendarIcon, MapPinIcon } from "@/components/icons";
import { VenueMap } from "@/components/VenueMap";
import { addressLine, mapsUrl } from "@/lib/activity";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import {
  formatDateTime,
  formatInr,
  formatRelative,
  formatTime,
  plural,
  refundWindow,
} from "@/lib/format";
import type { Activity, User } from "@/lib/types";
import type { PaymentState, SheetName } from "@/views/PartySheets";

const LONG_DESCRIPTION = 160;

// Badges, title, when and where.
export function PartyHeader({
  activity,
  inviter,
  pageUrl,
  live,
}: {
  activity: Activity;
  inviter: User | undefined;
  pageUrl: string;
  live: boolean;
}) {
  const hasPin = activity.lat !== undefined && activity.lng !== undefined;
  // Without a street address, the city still tells people roughly where.
  const address = addressLine(activity) || activity.city;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <CategoryBadge category={activity.category} subcategory={activity.subcategory} />
        <VisibilityBadge visibility={activity.visibility} />
        {inviter && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-2.5 py-1 text-xs font-semibold text-brand-700">
            <Avatar user={inviter} size="sm" className="h-4 w-4 ring-0" />
            Invited by {inviter.name}
          </span>
        )}
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink lg:text-4xl">
        {activity.title}
      </h1>
      <div className="flex gap-3 text-sm text-body">
        <CalendarIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <div>
          <p className="font-semibold">
            {formatDateTime(activity.startsAt)} – {formatTime(activity.endsAt)}
          </p>
          <p className="text-muted">
            {formatRelative(activity.startsAt, activity.endsAt)}
          </p>
          {live && (
            <p className="flex flex-wrap gap-x-4">
              <button
                type="button"
                onClick={() => downloadIcs(activity, pageUrl)}
                className="min-h-11 font-semibold text-brand-700 hover:underline"
              >
                Add to calendar
              </button>
              <a
                href={googleCalendarUrl(activity, pageUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline"
              >
                Google Calendar
              </a>
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-3 text-sm text-body">
        <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-location" />
        <p>
          <span className="font-semibold">{activity.venueName}</span>
          <br />
          {address && (
            <>
              <span className="text-muted">{address}</span>
              <br />
            </>
          )}
          <a
            href={mapsUrl(activity)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline"
          >
            Open in Maps
          </a>
        </p>
      </div>
      {hasPin && (
        <VenueMap
          center={{ lat: activity.lat!, lng: activity.lng! }}
          zoomed
          focus={null}
          label={`Map showing ${activity.venueName}`}
          className="h-72 lg:h-[28rem]"
        />
      )}
    </header>
  );
}

// Who's going, about, rules and the cancellation policy.
export function PartyBody({
  activity,
  attendees,
  friends,
  spotsLeft,
  live,
  waitlistNote,
  hostFriend,
}: {
  activity: Activity;
  attendees: User[];
  friends: User[];
  spotsLeft: number;
  live: boolean;
  // Shown only to viewers who could join the waitlist; null hides it.
  waitlistNote: string | null;
  // The host's first name when the viewer is their friend.
  hostFriend: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = activity.description.length > LONG_DESCRIPTION;
  return (
    <>
      <section
        aria-labelledby="going-heading"
        className="glass-card space-y-3 rounded-3xl p-4"
      >
        <h2 id="going-heading" className="text-lg font-bold text-ink">
          Who&apos;s going
        </h2>
        <div className="flex items-center gap-3">
          <AvatarStack users={attendees} />
          <p className="text-sm text-soft">
            <span className="font-semibold text-ink">
              {activity.goingCount} going
            </span>{" "}
            {live &&
              ` · ${spotsLeft === 0 ? "no spots left" : `${plural(spotsLeft, "spot")} left`}`}
            {activity.waitlistCount > 0 &&
              ` · ${activity.waitlistCount} on waitlist`}
            {activity.interestedCount > 0 &&
              ` · ${activity.interestedCount} interested`}
          </p>
        </div>
        {friends.length > 0 && (
          <p className="text-sm font-medium text-brand-700">
            {friends.map((f) => f.name.split(" ")[0]).join(", ")}{" "}
            {friends.length === 1 ? "is" : "are"} in. You know{" "}
            {friends.length === 1 ? "someone" : "people"} here.
          </p>
        )}
        {friends.length === 0 && hostFriend && (
          <p className="text-sm font-medium text-brand-700">
            Hosted by your friend {hostFriend}.
          </p>
        )}
        <div
          role="progressbar"
          aria-label="Spots filled"
          aria-valuemin={0}
          aria-valuemax={activity.capacity}
          aria-valuenow={activity.goingCount}
          className="h-2.5 overflow-hidden rounded-full bg-ink/10"
        >
          <div
            className="h-full origin-left animate-grow rounded-full bg-linear-to-r from-brand-600 to-accent transition-[width] duration-700 ease-out-soft"
            style={{
              width: `${Math.min((activity.goingCount / activity.capacity) * 100, 100)}%`,
            }}
          />
        </div>
        {waitlistNote && (
          <p className="text-xs text-muted">Waitlist: {waitlistNote}</p>
        )}
      </section>

      <section aria-labelledby="about-heading" className="space-y-2">
        <h2 id="about-heading" className="text-lg font-bold text-ink">
          About
        </h2>
        <p
          className={`whitespace-pre-line text-body ${isLong && !expanded ? "line-clamp-3" : ""}`}
        >
          {activity.description}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="min-h-11 text-sm font-semibold text-brand-700 hover:underline"
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </section>

      {activity.tags.length > 0 && (
        <section aria-labelledby="rules-heading" className="space-y-3">
          <h2 id="rules-heading" className="text-lg font-bold text-ink">
            What to bring / rules
          </h2>
          <ul className="flex flex-wrap gap-2">
            {activity.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-line bg-surface/60 px-3 py-1.5 text-sm text-body shadow-sm"
              >
                {tag}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="refund-heading" className="space-y-1">
        <h2 id="refund-heading" className="text-lg font-bold text-ink">
          Cancellation
        </h2>
        <p className="text-sm text-soft">
          {activity.priceP === 0
            ? "Free to join. You can leave any time."
            : `Leave ${refundWindow(activity.refundCutoffHours)} for a full refund.${
                activity.refundCutoffHours > 0 ? " After that there is no refund." : ""
              } If the host cancels, you are refunded in full.`}
        </p>
      </section>
    </>
  );
}

export type CtaState =
  | "cancelled"
  | "ended"
  | "hosting"
  | "joined"
  | "waitlisted"
  | "anonymous"
  | "full"
  | "open";

// The main button(s) for the viewer's relationship to the plan.
export function PartyCta({
  state,
  activity,
  waitlistPosition,
  totalP,
  busy,
  payment,
  onSheet,
  onStartJoin,
  onJoinWaitlist,
  onLeaveWaitlist,
}: {
  state: CtaState;
  activity: Activity;
  waitlistPosition: number;
  totalP: number;
  busy: boolean;
  payment: PaymentState;
  onSheet: (sheet: SheetName) => void;
  onStartJoin: () => void;
  onJoinWaitlist: () => void;
  onLeaveWaitlist: () => void;
}) {
  switch (state) {
    case "cancelled":
      return (
        <Button disabled className="flex-1">
          Cancelled
        </Button>
      );
    case "ended":
      return (
        <Button disabled className="flex-1">
          Ended
        </Button>
      );
    case "hosting":
      return (
        <Link
          href={`/host/${activity.id}`}
          className={buttonClass("primary", "flex-1")}
        >
          Manage activity
        </Link>
      );
    case "joined":
      return (
        <>
          <Button className="flex-1" onClick={() => onSheet("ticket")}>
            View ticket
          </Button>
          <Button variant="secondary" onClick={() => onSheet("leave")}>
            Leave
          </Button>
        </>
      );
    case "waitlisted":
      return (
        <>
          <span className="flex min-h-11 flex-1 animate-pop items-center justify-center rounded-2xl border border-warning/25 bg-warning/15 px-3 text-sm font-semibold text-warning">
            Waitlist #{waitlistPosition}
          </span>
          <Button variant="secondary" loading={busy} onClick={onLeaveWaitlist}>
            Leave
          </Button>
        </>
      );
    case "anonymous":
      return (
        <Button onClick={() => onSheet("login")} className="flex-1">
          {activity.goingCount >= activity.capacity
            ? "Log in to join the waitlist"
            : "Log in to join"}
        </Button>
      );
    case "full":
      return (
        <Button className="flex-1" loading={busy} onClick={onJoinWaitlist}>
          Full · Join waitlist
        </Button>
      );
    case "open":
      return (
        <Button
          onClick={onStartJoin}
          loading={payment === "processing"}
          className="flex-1"
        >
          {payment === "processing"
            ? "Joining…"
            : totalP === 0
              ? "Join for free"
              : `Pay ${formatInr(totalP)} & Join`}
        </Button>
      );
  }
}
