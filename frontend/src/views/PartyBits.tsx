"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import {
  acceptFriendRequest,
  addReview,
  openInvite,
  sendFriendRequest,
} from "@/api";
import { Avatar } from "@/components/Avatar";
import { VisibilityBadge } from "@/components/Badge";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Cover } from "@/components/Cover";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeftIcon, LockIcon } from "@/components/icons";
import { NAV_BACK } from "@/components/PageTransition";
import { Skeleton } from "@/components/Skeleton";
import { Stars, VerifiedBadges } from "@/components/UserBits";
import { formatDateTime, formatPrice } from "@/lib/format";
import { toast } from "@/lib/toast";
import type {
  Activity,
  FriendRequest,
  Review,
  User,
  UserStats,
} from "@/lib/types";

const REVIEW_TAGS = [
  "On time",
  "Well organised",
  "Friendly crowd",
  "Great venue",
  "Worth the price",
];

export const OVERLAY_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition duration-200 hover:bg-white/35 active:scale-90";

// Records ?invite= and ?ref= from a shared link once the data has loaded. The
// detail query refetches by itself afterwards, so the page picks up the access.
export function InviteCapture({ activityId }: { activityId: string }) {
  const params = useSearchParams();
  const token = params.get("invite");
  const ref = params.get("ref");
  useEffect(() => {
    if (token || ref) void openInvite(activityId, token, ref);
  }, [activityId, token, ref]);
  return null;
}

export function NotFound() {
  return (
    <ViewTransition key="missing" enter="fade-in" default="none">
      <div>
        <EmptyState
        page
          emoji="🕵️"
          title="Activity not found"
          body="This link may be wrong, or the activity was removed."
          action={
            <Link href="/" className={buttonClass("primary")}>
              Explore activities
            </Link>
          }
        />
      </div>
    </ViewTransition>
  );
}

export function PartySkeleton() {
  return (
    <div className="lg:px-8">
      <Skeleton className="h-64 rounded-none rounded-b-[2rem] lg:mt-6 lg:h-80 lg:rounded-[2rem]" />
      <div className="space-y-3 p-4 lg:px-0">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export function BackButton() {
  return (
    <Link
      href="/"
      transitionTypes={NAV_BACK}
      aria-label="Back to home"
      className={OVERLAY_BUTTON}
    >
      <ArrowLeftIcon className="h-5 w-5" />
    </Link>
  );
}

export function HostBlock({
  host,
  stats,
  mutual,
  friend,
}: {
  host: User;
  stats: UserStats;
  mutual: User[];
  friend: boolean;
}) {
  return (
    <Link
      href={`/u/${host.handle}`}
      className="glass-card flex items-center gap-3 rounded-3xl p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98]"
    >
      <Avatar user={host} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">Hosted by</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
          <span className="truncate">{host.name}</span>
          <VerifiedBadges user={host} />
        </p>
        {(friend || mutual.length > 0) && (
          <p className="text-xs font-medium text-brand-700">
            {friend
              ? "Your friend"
              : `${mutual.length} mutual friend${mutual.length === 1 ? "" : "s"}: ${mutual
                  .map((u) => u.name.split(" ")[0])
                  .join(", ")}`}
          </p>
        )}
      </div>
      <p className="text-right text-sm text-soft">
        <span className="font-semibold text-ink">
          {stats.rating > 0 ? `★ ${stats.rating.toFixed(1)}` : "New host"}
        </span>
        <br />
        {stats.hostedCount} hosted
        {stats.attendance !== null && (
          <>
            <br />
            {stats.attendance}% show-up
          </>
        )}
      </p>
    </Link>
  );
}

// Shown instead of the details when the viewer isn't in the host's circle.
export function LockedParty({
  activity,
  host,
  hostStats,
  mutual,
  viewer,
  request,
}: {
  activity: Activity;
  host: User;
  hostStats: UserStats;
  mutual: User[];
  viewer: User | null;
  request: FriendRequest | null;
}) {
  const [sent, setSent] = useState(false);
  const hostFirstName = host.name.split(" ")[0];
  const loginHref = `/login?next=${encodeURIComponent(`/party/${activity.id}`)}`;

  const addFriend = async () => {
    setSent(true);
    const result = await sendFriendRequest(host.id);
    if (!result.ok) {
      setSent(false);
      toast(result.message);
      return;
    }
    toast(`Friend request sent to ${host.name}`);
  };

  const accept = async (requestId: string) => {
    const result = await acceptFriendRequest(requestId);
    if (!result.ok) toast(result.message);
  };

  let action;
  if (!viewer) {
    action = (
      <Link href={loginHref} className={buttonClass("primary", "w-full")}>
        Log in to check your access
      </Link>
    );
  } else if (!request) {
    action = (
      <Button className="w-full" disabled={sent} onClick={addFriend}>
        {sent ? "Friend request sent" : `Add ${hostFirstName} as a friend`}
      </Button>
    );
  } else if (request.fromId === viewer.id) {
    action = (
      <Button disabled className="w-full">
        Friend request sent
      </Button>
    );
  } else {
    action = (
      <Button className="w-full" onClick={() => accept(request.id)}>
        Accept {hostFirstName}&apos;s friend request
      </Button>
    );
  }

  return (
    <div className="pb-12 lg:px-8 lg:pt-6">
      <div className="relative overflow-hidden rounded-b-[2rem] lg:rounded-[2rem]">
        <Cover
          activity={activity}
          className="h-64 w-full scale-110 blur-2xl lg:h-80"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
          <span className="flex h-16 w-16 animate-pop items-center justify-center rounded-full border border-white/40 bg-white/20 backdrop-blur-md">
            <LockIcon className="h-7 w-7" />
          </span>
          <VisibilityBadge visibility={activity.visibility} />
        </div>
        <div className="absolute top-0 left-0 p-3">
          <BackButton />
        </div>
      </div>
      <div className="stagger mx-auto max-w-xl space-y-5 px-4 pt-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          This is a private plan
        </h1>
        <p className="text-soft">
          {activity.visibility === "friends"
            ? `Only ${hostFirstName}'s friends can see the details and join.`
            : `Only ${hostFirstName}'s friends and their friends can see the details and join.`}{" "}
          Ask {hostFirstName} to add you, or to send you their invite link.
        </p>
        <p className="text-sm font-medium text-body">
          {formatDateTime(activity.startsAt)} · {activity.city}
        </p>
        <div className="text-left">
          <HostBlock
            host={host}
            stats={hostStats}
            mutual={mutual}
            friend={false}
          />
        </div>
        {action}
      </div>
    </div>
  );
}

export function ReviewCard({
  activityId,
  existing,
}: {
  activityId: string;
  existing: Review | null;
}) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (existing) {
    return (
      <section className="glass-card space-y-1 rounded-3xl p-4 text-center">
        <h2 className="text-lg font-bold text-ink">Your rating</h2>
        <Stars value={existing.rating} size="lg" />
        {existing.tags.length > 0 && (
          <p className="text-sm text-soft">{existing.tags.join(" · ")}</p>
        )}
      </section>
    );
  }

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );

  const submit = async () => {
    setSaving(true);
    const result = await addReview(activityId, rating, tags);
    setSaving(false);
    toast(result.ok ? "Thanks for rating!" : result.message);
  };

  return (
    <section className="glass-card space-y-3 rounded-3xl p-4 text-center">
      <h2 className="text-lg font-bold text-ink">How was it?</h2>
      <p className="text-sm text-soft">
        Your rating shows on the host&apos;s profile.
      </p>
      <Stars value={rating} onChange={setRating} size="lg" />
      <div className="flex flex-wrap justify-center gap-2">
        {REVIEW_TAGS.map((tag) => (
          <Chip
            key={tag}
            selected={tags.includes(tag)}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </Chip>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={rating === 0}
        loading={saving}
        onClick={submit}
      >
        Submit rating
      </Button>
    </section>
  );
}

export function PriceLabel({ activity }: { activity: Activity }) {
  return (
    <div>
      <p
        className={`text-xl font-extrabold ${activity.priceP === 0 ? "text-success" : "text-ink"}`}
      >
        {formatPrice(activity.priceP)}
      </p>
      {activity.priceP > 0 && <p className="text-xs text-muted">per person</p>}
    </div>
  );
}
