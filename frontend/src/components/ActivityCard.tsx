"use client";

import Link from "next/link";
import {
  useState,
  ViewTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { setInterested } from "@/api";
import { Avatar } from "@/components/Avatar";
import { CategoryBadge, VisibilityBadge } from "@/components/Badge";
import { Cover } from "@/components/Cover";
import { ClockIcon, HeartIcon, LockIcon, MapPinIcon } from "@/components/icons";
import { NAV_FORWARD } from "@/components/PageTransition";
import { formatDateTime, formatPrice, formatTime, plural } from "@/lib/format";
import {
  coverTransitionName,
  setMorphSource,
  useIsMorphSource,
} from "@/lib/morph";
import { toast } from "@/lib/toast";
import type { Activity, User } from "@/lib/types";

interface ActivityCardProps {
  activity: Activity;
  going: number;
  host?: User;
  // People going, shown as faces: who is there matters more than the listing.
  attendees?: User[];
  // The viewer's friends who are going or hosting.
  friends?: User[];
  compact?: boolean;
  // The viewer may not see this activity: details are hidden behind a lock.
  locked?: boolean;
  // Short status shown instead of the going count, e.g. "Waitlist #2".
  note?: string;
  // Distinguishes cards for the same activity shown in different lists on one page.
  scope?: string;
  // The viewer holds a ticket: shown as a "You're going" badge.
  mine?: boolean;
  // The viewer has saved this plan. Left undefined, no heart is drawn (guests,
  // the wizard preview).
  interested?: boolean;
  // Render as a plain block instead of a link (wizard preview).
  preview?: boolean;
  className?: string;
}

const MAX_FACES = 3;
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });

// "OCT / 25 / Sun" tile that sits on the cover's bottom edge.
function DateTile({ iso }: { iso: string }) {
  const date = new Date(iso);
  return (
    <span className="glass flex w-14 flex-col items-center rounded-2xl border-brand-600/40 py-1.5 leading-none shadow-lg">
      <span className="text-[10px] font-bold tracking-wider text-brand-700 uppercase">
        {MONTH.format(date)}
      </span>
      <span className="mt-0.5 text-2xl font-extrabold text-ink">
        {date.getDate()}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold text-soft">
        {WEEKDAY.format(date)}
      </span>
    </span>
  );
}

// Heart in the cover corner. It lives inside the card's link, so it stops
// the click from opening the plan.
function SaveButton({
  activityId,
  interested,
}: {
  activityId: string;
  interested: boolean;
}) {
  const [saved, setSaved] = useState(interested);
  const [busy, setBusy] = useState(false);
  // The same plan can sit in two rows; after a save the refetch brings the
  // other card's copy up to date (state adjusted during render, not an effect).
  const [seen, setSeen] = useState(interested);
  if (seen !== interested) {
    setSeen(interested);
    setSaved(interested);
  }
  const toggle = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    const result = await setInterested(activityId, next);
    setBusy(false);
    if (!result.ok) {
      setSaved(!next);
      toast(result.message);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save this plan"}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur transition duration-200 active:scale-90 ${
        saved
          ? "border-location/60 bg-location/25 text-location"
          : "border-white/25 bg-black/30 text-white hover:bg-black/45"
      }`}
    >
      <HeartIcon filled={saved} className="h-5 w-5" />
    </button>
  );
}

export function ActivityCard({
  activity,
  going,
  host,
  attendees = [],
  friends = [],
  compact = false,
  locked = false,
  note,
  scope = "list",
  preview = false,
  mine = false,
  interested,
  className = "",
}: ActivityCardProps) {
  const morphKey = `${scope}:${activity.id}`;
  const isMorphSource = useIsMorphSource(morphKey);
  const price = formatPrice(activity.priceP);
  const cancelled = activity.status === "cancelled";
  const place = `${activity.venueName} · ${activity.city}`;
  const status = cancelled
    ? "Cancelled"
    : (note ?? `${going}/${activity.capacity} going`);
  const spotsLeft = Math.max(activity.capacity - going, 0);

  let people: string;
  // `friends` includes a host friend, who isn't counted in "going": name them
  // as the host, and only friends with a ticket as going.
  const goingFriends = friends.filter((f) => f.id !== activity.hostId);
  const hostFriend = friends.find((f) => f.id === activity.hostId);
  if (cancelled) people = "Cancelled";
  else if (note) people = note;
  else if (goingFriends.length > 0) {
    const others = goingFriends.length - 1;
    people = `${goingFriends[0].name.split(" ")[0]}${
      others > 0 ? ` +${others}` : ""
    } going`;
  } else if (hostFriend)
    people = `Hosted by your friend ${hostFriend.name.split(" ")[0]}${
      going > 0 ? ` · ${going} going` : ""
    }`;
  else if (going === 0) people = "Be the first to join";
  else people = `${going} ${going === 1 ? "person is" : "people are"} going`;

  const room =
    spotsLeft === 0
      ? "Full"
      : spotsLeft <= 3
        ? `Needs ${spotsLeft} more`
        : `${plural(spotsLeft, "spot")} left`;

  const frame = (classes: string, children: ReactNode) =>
    preview ? (
      <div className={classes}>{children}</div>
    ) : (
      <Link
        href={`/party/${activity.id}`}
        transitionTypes={NAV_FORWARD}
        onClick={() => setMorphSource(morphKey)}
        className={`${classes} transition duration-300 active:scale-[0.98]`}
      >
        {children}
      </Link>
    );

  let cover = compact ? (
    <Cover
      activity={activity}
      className={`h-24 w-24 shrink-0 rounded-2xl md:h-28 md:w-28 ${cancelled ? "grayscale" : ""}`}
      emojiClassName="text-4xl"
    />
  ) : (
    <Cover
      activity={activity}
      className={`h-44 w-full md:h-48 ${locked ? "scale-110 blur-xl" : ""} ${cancelled ? "grayscale" : ""}`}
    />
  );
  if (isMorphSource && !locked) {
    cover = (
      <ViewTransition
        name={coverTransitionName(activity.id)}
        share="morph"
        default="none"
      >
        {cover}
      </ViewTransition>
    );
  }

  if (compact) {
    return frame(
      `group glass-card flex min-w-0 items-center gap-4 rounded-3xl p-2.5 hover:-translate-y-0.5 hover:shadow-xl ${className}`,
      <>
        {cover}
        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="truncate text-lg font-bold text-ink md:text-xl">
            {activity.title}
          </h3>
          <p className="truncate text-base text-soft">
            {formatDateTime(activity.startsAt)}
          </p>
          <p className="truncate text-base text-muted">{place}</p>
          <p
            className={`text-sm ${cancelled ? "font-semibold text-red-400" : "text-muted"}`}
          >
            {status} · <span className="font-semibold text-ink">{price}</span>
          </p>
        </div>
      </>,
    );
  }

  if (locked) {
    return frame(
      `group glass-card block overflow-hidden rounded-3xl hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-600/15 ${className}`,
      <>
        <div className="relative overflow-hidden">
          {cover}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/20 backdrop-blur-md">
              <LockIcon className="h-5 w-5" />
            </span>
            <VisibilityBadge visibility={activity.visibility} />
          </div>
        </div>
        <div className="space-y-1.5 p-4 md:p-5">
          <h3 className="truncate text-lg font-bold text-ink md:text-xl">
            Private plan
          </h3>
          <p className="truncate text-base text-soft">
            {formatDateTime(activity.startsAt)}
          </p>
          <p className="text-base text-muted">
            {host
              ? activity.visibility === "friends"
                ? `Add ${host.name.split(" ")[0]} as a friend to see this`
                : `For friends of ${host.name.split(" ")[0]}'s friends`
              : "Only visible to the host's circle"}
          </p>
        </div>
      </>,
    );
  }

  return frame(
    `group glass-card block overflow-hidden rounded-3xl hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-600/15 ${className}`,
    <>
      <div className="relative">
        {cover}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <CategoryBadge
              category={activity.category}
              subcategory={activity.subcategory}
            />
            {mine && !cancelled ? (
              <span className="rounded-full bg-success px-2.5 py-1 text-xs font-bold text-white shadow">
                You&apos;re going
              </span>
            ) : (
              <VisibilityBadge visibility={activity.visibility} />
            )}
          </div>
          {interested !== undefined && !preview && !cancelled && (
            <SaveButton activityId={activity.id} interested={interested} />
          )}
        </div>
        <div className="absolute -bottom-4 left-4">
          <DateTile iso={activity.startsAt} />
        </div>
      </div>
      <div className="space-y-1.5 px-4 pt-7 pb-4 md:px-5 md:pb-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-lg font-bold text-ink md:text-xl">
            {activity.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
              activity.priceP === 0
                ? "bg-success/15 text-success"
                : "bg-brand-600/15 text-brand-700"
            }`}
          >
            {price}
          </span>
        </div>
        <p className="flex items-center gap-1.5 truncate text-sm text-soft">
          <MapPinIcon className="h-4 w-4 shrink-0 text-location" />
          <span className="truncate">{place}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-soft">
          <ClockIcon className="h-4 w-4 shrink-0 text-accent" />
          {formatTime(activity.startsAt)} – {formatTime(activity.endsAt)}
        </p>
        <div className="flex items-center gap-2 pt-2">
          {attendees.length > 0 && (
            <span className="flex shrink-0 -space-x-1.5">
              {attendees.slice(0, MAX_FACES).map((person) => (
                <Avatar
                  key={person.id}
                  user={person}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
              {going > MAX_FACES && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white ring-2 ring-surface">
                  +{going - MAX_FACES}
                </span>
              )}
            </span>
          )}
          <span
            className={`min-w-0 truncate text-sm font-semibold ${
              cancelled
                ? "text-red-400"
                : friends.length > 0
                  ? "text-brand-700"
                  : "text-ink"
            }`}
          >
            {people}
          </span>
        </div>
        {/* Second line, so the people line above never has to be cut short. */}
        <p className="flex items-center justify-between gap-2 text-xs text-muted">
          {host && (
            <span className="min-w-0 truncate">Hosted by {host.name}</span>
          )}
          {!cancelled && (
            <span
              className={`ml-auto shrink-0 font-medium ${
                spotsLeft > 0 && spotsLeft <= 3 ? "text-warning" : ""
              }`}
            >
              {room}
            </span>
          )}
        </p>
      </div>
    </>,
  );
}
