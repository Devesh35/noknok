"use client";

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { CategoryBadge, VisibilityBadge } from "@/components/Badge";
import { Cover } from "@/components/Cover";
import { LockIcon } from "@/components/icons";
import { NAV_FORWARD } from "@/components/PageTransition";
import { formatDateTime, formatPrice } from "@/lib/format";
import { coverTransitionName, setMorphSource, useIsMorphSource } from "@/lib/morph";
import type { Activity, User } from "@/lib/types";

interface ActivityCardProps {
  activity: Activity;
  going: number;
  host?: User;
  compact?: boolean;
  // The viewer may not see this activity: details are hidden behind a lock.
  locked?: boolean;
  distanceKm?: number;
  // Short status shown instead of the going count, e.g. "Waitlist #2".
  note?: string;
  // Distinguishes cards for the same activity shown in different lists on one page.
  scope?: string;
  // Render as a plain block instead of a link (wizard preview).
  preview?: boolean;
  className?: string;
}

function formatDistance(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km away` : `${Math.round(km)} km away`;
}

export function ActivityCard({
  activity,
  going,
  host,
  compact = false,
  locked = false,
  distanceKm,
  note,
  scope = "list",
  preview = false,
  className = "",
}: ActivityCardProps) {
  const morphKey = `${scope}:${activity.id}`;
  const isMorphSource = useIsMorphSource(morphKey);
  const price = formatPrice(activity.priceInr);
  const cancelled = activity.status === "cancelled";
  const place = `${activity.venueName} · ${activity.city}`;
  const status = cancelled ? "Cancelled" : (note ?? `${going}/${activity.capacity} going`);

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
      className={`h-52 w-full md:h-60 ${locked ? "scale-110 blur-xl" : ""} ${cancelled ? "grayscale" : ""}`}
    />
  );
  if (isMorphSource && !locked) {
    cover = (
      <ViewTransition name={coverTransitionName(activity.id)} share="morph" default="none">
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
          <h3 className="truncate text-lg font-bold text-ink md:text-xl">{activity.title}</h3>
          <p className="truncate text-base text-soft">{formatDateTime(activity.startsAt)}</p>
          <p className="truncate text-base text-muted">{place}</p>
          <p className={`text-sm ${cancelled ? "font-semibold text-red-400" : "text-muted"}`}>
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
          <h3 className="truncate text-lg font-bold text-ink md:text-xl">Private plan</h3>
          <p className="truncate text-base text-soft">{formatDateTime(activity.startsAt)}</p>
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
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <CategoryBadge category={activity.category} />
          <VisibilityBadge visibility={activity.visibility} />
        </div>
        <span className="absolute right-3 bottom-3 rounded-full bg-surface/85 px-3 py-1.5 text-sm font-bold text-ink shadow backdrop-blur">
          {price}
        </span>
      </div>
      <div className="space-y-1.5 p-4 md:p-5">
        <h3 className="truncate text-lg font-bold text-ink md:text-xl">{activity.title}</h3>
        <p className="truncate text-base text-soft">{formatDateTime(activity.startsAt)}</p>
        <p className="truncate text-base text-muted">
          {place}
          {distanceKm !== undefined && (
            <span className="font-medium text-location"> · {formatDistance(distanceKm)}</span>
          )}
        </p>
        <div className="flex items-center justify-between gap-2 pt-2">
          <span
            className={`text-sm font-medium ${cancelled ? "text-red-400" : "text-soft"}`}
          >
            {status}
          </span>
          {host && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
              <Avatar user={host} size="sm" />
              <span className="truncate">{host.name}</span>
            </span>
          )}
        </div>
      </div>
    </>,
  );
}
