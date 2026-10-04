"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import {
  acceptFriendRequest,
  activeJoin,
  activityById,
  addReview,
  breakdownFor,
  canView,
  goingJoins,
  graphOf,
  hostRating,
  hostedCount,
  inviteFor,
  isPast,
  isRefundable,
  joinWaitlist,
  leaveActivity,
  me,
  mutualFriends,
  openInvite,
  payAndJoin,
  PAYMENT_MODE,
  PaymentError,
  requestBetween,
  reviewBy,
  sendFriendRequest,
  useDb,
  userById,
  waitlistJoins,
} from "@/api";
import { Avatar, AvatarStack } from "@/components/Avatar";
import { CategoryBadge, VisibilityBadge } from "@/components/Badge";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Cover } from "@/components/Cover";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeftIcon, CalendarIcon, LockIcon, MapPinIcon, ShareIcon } from "@/components/icons";
import { NAV_BACK } from "@/components/PageTransition";
import { ShareSheet } from "@/components/ShareSheet";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { PriceRows, TicketCard } from "@/components/Ticket";
import { Stars, VerifiedBadges } from "@/components/UserBits";
import { mapsUrl } from "@/lib/activity";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { formatDateTime, formatInr, formatPrice, formatRelative, formatTime } from "@/lib/format";
import { coverTransitionName } from "@/lib/morph";
import { toast } from "@/lib/toast";
import type { Activity, Db, User } from "@/lib/types";
import { isFriend } from "@/lib/visibility";
import { waitlistPosition } from "@/lib/waitlist";

const LONG_DESCRIPTION = 160;
const MAP_SPAN = 0.008; // degrees shown around the pin
const REVIEW_TAGS = ["On time", "Well organised", "Friendly crowd", "Great venue", "Worth the price"];

const OVERLAY_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white shadow-lg backdrop-blur-md transition duration-200 hover:bg-white/35 active:scale-90";

type SheetName = "login" | "checkout" | "success" | "ticket" | "leave" | "share";
type CtaState =
  | "cancelled"
  | "ended"
  | "hosting"
  | "joined"
  | "waitlisted"
  | "anonymous"
  | "full"
  | "open";

// Records ?invite= and ?ref= from a shared link once the data has loaded.
function InviteCapture({ activityId }: { activityId: string }) {
  const params = useSearchParams();
  const token = params.get("invite");
  const ref = params.get("ref");
  useEffect(() => {
    if (token || ref) openInvite(activityId, token, ref);
  }, [activityId, token, ref]);
  return null;
}

function PartySkeleton() {
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

function BackButton() {
  return (
    <Link href="/" transitionTypes={NAV_BACK} aria-label="Back to home" className={OVERLAY_BUTTON}>
      <ArrowLeftIcon className="h-5 w-5" />
    </Link>
  );
}

function HostBlock({ db, host, viewer }: { db: Db; host: User; viewer: User | null }) {
  const { rating } = hostRating(db, host.id);
  const mutual = viewer && viewer.id !== host.id ? mutualFriends(db, viewer.id, host.id) : [];
  const friend = viewer ? isFriend(graphOf(db), viewer.id, host.id) : false;
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
          {rating > 0 ? `★ ${rating.toFixed(1)}` : "New host"}
        </span>
        <br />
        {hostedCount(db, host.id)} hosted
      </p>
    </Link>
  );
}

// Shown instead of the details when the viewer isn't in the host's circle.
function LockedParty({
  db,
  activity,
  host,
  viewer,
}: {
  db: Db;
  activity: Activity;
  host: User | undefined;
  viewer: User | null;
}) {
  const request = viewer && host ? requestBetween(db, viewer.id, host.id) : undefined;
  const hostFirstName = host?.name.split(" ")[0] ?? "the host";
  const loginHref = `/login?next=${encodeURIComponent(`/party/${activity.id}`)}`;

  let action;
  if (!viewer) {
    action = (
      <Link href={loginHref} className={buttonClass("primary", "w-full")}>
        Log in to check your access
      </Link>
    );
  } else if (!host) {
    action = null;
  } else if (!request) {
    action = (
      <Button
        className="w-full"
        onClick={() => {
          sendFriendRequest(host.id);
          toast(`Friend request sent to ${host.name}`);
        }}
      >
        Add {hostFirstName} as a friend
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
      <Button className="w-full" onClick={() => acceptFriendRequest(request.id)}>
        Accept {hostFirstName}&apos;s friend request
      </Button>
    );
  }

  return (
    <div className="pb-12 lg:px-8 lg:pt-6">
      <div className="relative overflow-hidden rounded-b-[2rem] lg:rounded-[2rem]">
        <Cover activity={activity} className="h-64 w-full scale-110 blur-2xl lg:h-80" />
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
        {host && (
          <div className="text-left">
            <HostBlock db={db} host={host} viewer={viewer} />
          </div>
        )}
        {action}
      </div>
    </div>
  );
}

function ReviewCard({ db, activity, viewer }: { db: Db; activity: Activity; viewer: User }) {
  const existing = reviewBy(db, activity.id, viewer.id);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);

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
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );

  return (
    <section className="glass-card space-y-3 rounded-3xl p-4 text-center">
      <h2 className="text-lg font-bold text-ink">How was it?</h2>
      <p className="text-sm text-soft">Your rating shows on the host&apos;s profile.</p>
      <Stars value={rating} onChange={setRating} size="lg" />
      <div className="flex flex-wrap justify-center gap-2">
        {REVIEW_TAGS.map((tag) => (
          <Chip key={tag} selected={tags.includes(tag)} onClick={() => toggleTag(tag)}>
            {tag}
          </Chip>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={rating === 0}
        onClick={() => {
          addReview(activity.id, rating, tags);
          toast("Thanks for rating!");
        }}
      >
        Submit rating
      </Button>
    </section>
  );
}

function PriceLabel({ activity }: { activity: Activity }) {
  return (
    <div>
      <p
        className={`text-xl font-extrabold ${activity.priceInr === 0 ? "text-success" : "text-ink"}`}
      >
        {formatPrice(activity.priceInr)}
      </p>
      {activity.priceInr > 0 && <p className="text-xs text-muted">per person</p>}
    </div>
  );
}

export function PartyView({ id }: { id: string }) {
  const db = useDb();
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [payment, setPayment] = useState<"idle" | "processing" | "failed">("idle");
  const [expanded, setExpanded] = useState(false);

  if (!db) {
    return (
      <ViewTransition key="skeleton" exit="fade-out" default="none">
        <PartySkeleton />
      </ViewTransition>
    );
  }

  const activity = activityById(db, id);
  if (!activity) {
    return (
      <ViewTransition key="missing" enter="fade-in" default="none">
        <div>
          <EmptyState
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

  const viewer = me(db);
  const host = userById(db, activity.hostId);
  const isHost = viewer?.id === activity.hostId;
  const capture = <InviteCapture activityId={activity.id} />;

  if (!canView(db, activity)) {
    return (
      <ViewTransition key="locked" enter="fade-in" default="none">
        <div>
          {capture}
          <LockedParty db={db} activity={activity} host={host} viewer={viewer} />
        </div>
      </ViewTransition>
    );
  }

  const going = goingJoins(db, activity.id);
  const goingUsers = going
    .map((join) => userById(db, join.userId))
    .filter((u): u is User => u !== undefined);
  const waitlist = waitlistJoins(db, activity.id);
  const spotsLeft = Math.max(activity.capacity - going.length, 0);
  const myJoin = activeJoin(db, activity.id, viewer?.id ?? null);
  const price = breakdownFor(db, activity);
  const past = isPast(activity);
  const cancelled = activity.status === "cancelled";
  const refundable = isRefundable(activity);
  const inviter = userById(db, inviteFor(db, activity.id)?.refId ?? "");
  const myCancelledJoin = db.joins.find(
    (j) => j.activityId === activity.id && j.userId === viewer?.id && j.status === "host_cancelled",
  );

  let state: CtaState;
  if (cancelled) state = "cancelled";
  else if (past) state = "ended";
  else if (isHost) state = "hosting";
  else if (myJoin?.status === "going") state = "joined";
  else if (myJoin?.status === "waitlisted") state = "waitlisted";
  else if (!viewer) state = "anonymous";
  else if (spotsLeft === 0) state = "full";
  else state = "open";

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shareParams = new URLSearchParams();
  if (viewer) shareParams.set("ref", viewer.id);
  const isInviteLink = isHost && activity.visibility !== "open";
  if (isInviteLink) shareParams.set("invite", activity.inviteToken);
  const query = shareParams.toString();
  const pageUrl = `${origin}/party/${activity.id}`;
  const shareUrl = query ? `${pageUrl}?${query}` : pageUrl;

  const pay = async () => {
    setPayment("processing");
    try {
      await payAndJoin(activity.id);
      setPayment("idle");
      setSheet("success");
    } catch (error) {
      if (error instanceof PaymentError && error.reason === "dismissed") {
        setPayment("idle");
      } else if (error instanceof PaymentError) {
        setPayment("failed");
        setSheet("checkout");
      } else {
        setPayment("idle");
        toast(error instanceof Error ? error.message : "Couldn't join");
      }
    }
  };

  const startJoin = () => {
    if (price.total > 0) {
      setPayment("idle");
      setSheet("checkout");
    } else {
      pay();
    }
  };

  const leave = () => {
    const refund = leaveActivity(activity.id);
    setSheet(null);
    toast(refund > 0 ? `You left. ${formatInr(refund)} will be refunded.` : "You left this activity");
  };

  const waitlistNote =
    activity.waitlistMode === "approval"
      ? "The host picks who gets a spot."
      : "You get the next free spot automatically.";

  let cta;
  switch (state) {
    case "cancelled":
      cta = (
        <Button disabled className="flex-1">
          Cancelled
        </Button>
      );
      break;
    case "ended":
      cta = (
        <Button disabled className="flex-1">
          Ended
        </Button>
      );
      break;
    case "hosting":
      cta = (
        <Link href={`/host/${activity.id}`} className={buttonClass("primary", "flex-1")}>
          Manage activity
        </Link>
      );
      break;
    case "joined":
      cta = (
        <>
          <Button className="flex-1" onClick={() => setSheet("ticket")}>
            View ticket
          </Button>
          <Button variant="secondary" onClick={() => setSheet("leave")}>
            Leave
          </Button>
        </>
      );
      break;
    case "waitlisted":
      cta = (
        <>
          <span className="flex min-h-11 flex-1 animate-pop items-center justify-center rounded-2xl border border-warning/25 bg-warning/15 px-3 text-sm font-semibold text-warning">
            Waitlist #{waitlistPosition(db.joins, myJoin!.id)}
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              leaveActivity(activity.id);
              toast("You left the waitlist");
            }}
          >
            Leave
          </Button>
        </>
      );
      break;
    case "anonymous":
      cta = (
        <Button onClick={() => setSheet("login")} className="flex-1">
          Log in to join
        </Button>
      );
      break;
    case "full":
      cta = (
        <Button
          className="flex-1"
          onClick={() => {
            joinWaitlist(activity.id);
            toast(`You're on the waitlist. ${waitlistNote}`);
          }}
        >
          Full · Join waitlist
        </Button>
      );
      break;
    case "open":
      cta = (
        <Button onClick={startJoin} loading={payment === "processing"} className="flex-1">
          {payment === "processing"
            ? "Joining…"
            : price.total === 0
              ? "Join for free"
              : `Pay ${formatInr(price.total)} & Join`}
        </Button>
      );
      break;
  }

  const isLong = activity.description.length > LONG_DESCRIPTION;
  const hasPin = activity.lat !== undefined && activity.lng !== undefined;

  return (
    <ViewTransition key="content" enter="fade-in" default="none">
      <div className="pb-32 lg:px-8 lg:pt-6 lg:pb-12">
        {capture}
        <div className="relative">
          <ViewTransition name={coverTransitionName(activity.id)} share="morph" default="none">
            <Cover
              activity={activity}
              float
              className={`h-64 w-full rounded-b-[2rem] shadow-xl shadow-brand-600/15 lg:h-80 lg:rounded-[2rem] ${
                cancelled ? "grayscale" : ""
              }`}
              emojiClassName="text-8xl"
            />
          </ViewTransition>
          <div className="absolute inset-x-0 top-0 flex justify-between p-3">
            <BackButton />
            <button
              type="button"
              aria-label="Share"
              onClick={() => setSheet("share")}
              className={OVERLAY_BUTTON}
            >
              <ShareIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="gap-8 px-4 pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:px-0 lg:pt-6">
          <div className="stagger space-y-6">
            {cancelled && (
              <div role="status" className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                <p className="font-bold">This activity was cancelled by the host.</p>
                {myCancelledJoin && myCancelledJoin.refunded > 0 && (
                  <p>{formatInr(myCancelledJoin.refunded)} is being refunded to you.</p>
                )}
              </div>
            )}

            <header className="space-y-3">
              <div className="flex flex-wrap gap-1">
                <CategoryBadge category={activity.category} />
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
                  {!past && !cancelled && (
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
                  <span className="text-muted">{activity.address}</span>
                  <br />
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
                <iframe
                  title={`Map showing ${activity.venueName}`}
                  loading="lazy"
                  className="glass-card h-48 w-full rounded-3xl"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${activity.lng! - MAP_SPAN},${
                    activity.lat! - MAP_SPAN
                  },${activity.lng! + MAP_SPAN},${activity.lat! + MAP_SPAN}&layer=mapnik&marker=${
                    activity.lat
                  },${activity.lng}`}
                />
              )}
            </header>

            {host && <HostBlock db={db} host={host} viewer={viewer} />}

            {past && !cancelled && viewer && !isHost && myJoin?.status === "going" && (
              <ReviewCard db={db} activity={activity} viewer={viewer} />
            )}

            <section aria-labelledby="going-heading" className="glass-card space-y-3 rounded-3xl p-4">
              <h2 id="going-heading" className="text-lg font-bold text-ink">
                Who&apos;s going
              </h2>
              <div className="flex items-center gap-3">
                <AvatarStack users={goingUsers} />
                <p className="text-sm text-soft">
                  <span className="font-semibold text-ink">{going.length} going</span> ·{" "}
                  {spotsLeft === 0 ? "no spots left" : `${spotsLeft} spots left`}
                  {waitlist.length > 0 && ` · ${waitlist.length} on waitlist`}
                </p>
              </div>
              <div
                role="progressbar"
                aria-label="Spots filled"
                aria-valuemin={0}
                aria-valuemax={activity.capacity}
                aria-valuenow={going.length}
                className="h-2.5 overflow-hidden rounded-full bg-ink/10"
              >
                <div
                  className="h-full origin-left animate-grow rounded-full bg-linear-to-r from-brand-600 to-accent transition-[width] duration-700 ease-out-soft"
                  style={{ width: `${Math.min((going.length / activity.capacity) * 100, 100)}%` }}
                />
              </div>
              {spotsLeft === 0 && !past && !cancelled && (
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
                {activity.priceInr === 0
                  ? "Free to join. You can leave any time."
                  : `Leave up to ${activity.refundCutoffHours} hours before the start for a full refund. After that there is no refund. If the host cancels, you are refunded in full.`}
              </p>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="glass sticky top-20 animate-rise space-y-4 rounded-[2rem] p-5">
              <PriceLabel activity={activity} />
              <div className="flex gap-2">{cta}</div>
              <p className="text-xs text-muted">
                {PAYMENT_MODE === "razorpay_test"
                  ? "Razorpay test mode: use a test card, no real money moves."
                  : "Prototype: no real payment is taken."}
              </p>
            </div>
          </aside>
        </div>

        <div className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[1.75rem] px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <PriceLabel activity={activity} />
            <div className="flex flex-1 gap-2">{cta}</div>
          </div>
        </div>

        <Sheet open={sheet === "login"} onClose={() => setSheet(null)} title="Log in to join">
          <p className="text-sm text-soft">
            You need an account to join <span className="font-semibold">{activity.title}</span>.
            It takes less than a minute.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(`/party/${activity.id}`)}`}
              className={buttonClass("primary")}
            >
              Continue with phone number
            </Link>
          </div>
        </Sheet>

        <Sheet open={sheet === "checkout"} onClose={() => setSheet(null)} title="Confirm and pay">
          <p className="text-sm text-soft">{activity.title}</p>
          <div className="mt-3">
            <PriceRows price={price} feeModel={db.dev.feeModel} />
          </div>
          {payment === "failed" && (
            <p role="alert" className="mt-3 animate-rise rounded-2xl bg-red-500/10 p-3 text-sm text-red-300">
              <span className="font-bold">Payment failed.</span> No money was taken. Try again, or
              use a different payment method.
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={pay} loading={payment === "processing"}>
              {payment === "processing"
                ? "Processing…"
                : payment === "failed"
                  ? `Retry · ${formatInr(price.total)}`
                  : `Pay ${formatInr(price.total)}`}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Cancel
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            {refundable
              ? `Full refund if you leave ${activity.refundCutoffHours}+ hours before the start.`
              : "This is inside the no-refund window: leaving later won't refund you."}{" "}
            NokNok holds the money and pays the host after the activity.
          </p>
        </Sheet>

        <Sheet open={sheet === "success"} onClose={() => setSheet(null)} title="You're in!">
          {sheet === "success" && (
            <p className="animate-pop py-1 text-center text-5xl" aria-hidden="true">
              🎉
            </p>
          )}
          {myJoin && viewer && (
            <div className="mt-2">
              <TicketCard join={myJoin} activity={activity} holder={viewer} />
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <Link href="/u/me" className={buttonClass("primary")}>
              View in my profile
            </Link>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Done
            </Button>
          </div>
        </Sheet>

        <Sheet open={sheet === "ticket"} onClose={() => setSheet(null)} title="Your ticket">
          {myJoin && viewer && <TicketCard join={myJoin} activity={activity} holder={viewer} />}
          <p className="mt-3 text-center text-xs text-muted">
            Show this to the host at the door.
          </p>
        </Sheet>

        <Sheet open={sheet === "leave"} onClose={() => setSheet(null)} title="Leave this activity?">
          <p className="text-sm text-soft">
            {!myJoin || myJoin.ticketPaid + myJoin.feePaid === 0
              ? "Your spot goes to the next person on the waitlist."
              : refundable
                ? `You'll get ${formatInr(myJoin.ticketPaid + myJoin.feePaid)} back. Your spot goes to the next person on the waitlist.`
                : `The free-cancellation window closed ${activity.refundCutoffHours} hours before the start, so there is no refund for your ${formatInr(myJoin.ticketPaid + myJoin.feePaid)}.`}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={leave}>
              {myJoin && myJoin.ticketPaid + myJoin.feePaid > 0 && !refundable
                ? "Leave without refund"
                : "Leave"}
            </Button>
            <Button variant="secondary" onClick={() => setSheet(null)}>
              Keep my spot
            </Button>
          </div>
        </Sheet>

        <ShareSheet
          open={sheet === "share"}
          onClose={() => setSheet(null)}
          title={activity.title}
          url={shareUrl}
          shortUrl={`${origin}/p/${activity.shortCode}`}
          isInvite={isInviteLink}
        />
      </div>
    </ViewTransition>
  );
}
