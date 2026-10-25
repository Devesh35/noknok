"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  approveWaitlist,
  cancelActivity,
  checkIn,
  useHostHub,
  useHostManage,
  useMe,
  type ErrorCode,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Field";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import { RemoveAttendee } from "@/views/HostRemove";
import { formatDate, formatDateTime, formatInr, plural } from "@/lib/format";
import { now } from "@/lib/time";
import { IS_PRODUCTION } from "@/lib/env";
import { toast } from "@/lib/toast";
import type { Activity, EarningsRow, JoinWithUser } from "@/lib/types";

const PAGE = "mx-auto w-full max-w-3xl space-y-6 px-4 py-6";
const TEXT_LINK =
  "inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline";

function isPast(activity: Activity): boolean {
  return Date.parse(activity.endsAt) < now();
}

// Transient failures get a toast; anything else means the page is stale, so
// the caller refetches and the screen shows the real state.
function isTransient(code: ErrorCode): boolean {
  return code === "NETWORK" || code === "SERVER" || code === "RATE_LIMITED";
}

function HostSkeleton() {
  return (
    <div className={PAGE}>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-32 w-full rounded-3xl" />
      <Skeleton className="h-32 w-full rounded-3xl" />
    </div>
  );
}

function LoginPrompt({ next }: { next: string }) {
  return (
    <EmptyState
      page
      emoji="📣"
      title="Host your own plan"
      body="Create a party, game or trek, choose who can see it, and let NokNok collect the money."
      action={
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className={buttonClass("primary")}
        >
          Log in to host
        </Link>
      }
    />
  );
}

function LoadFailed({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <EmptyState
      page
      emoji="📡"
      title="Couldn't load your hosting"
      body={message}
      action={<Button onClick={retry}>Try again</Button>}
    />
  );
}

function NotYours() {
  return (
    <EmptyState
      page
      emoji="🕵️"
      title="Not your activity"
      body="Only the host can manage an activity."
      action={
        <Link href="/host" className={buttonClass("primary")}>
          Your hosting
        </Link>
      }
    />
  );
}

// /host: entry point to hosting.
export function HostHub() {
  const { me: host, loaded } = useMe();
  const { data, error, refetch } = useHostHub(host !== null);
  if (!loaded) return <HostSkeleton />;
  if (!host) return <LoginPrompt next="/host" />;
  if (error) {
    if (error.code === "NOT_LOGGED_IN") return <LoginPrompt next="/host" />;
    return <LoadFailed message={error.message} retry={refetch} />;
  }
  if (data === undefined) return <HostSkeleton />;

  const mine = data.activities;
  const upcoming = mine.filter(
    ({ activity }) => activity.status === "active" && !isPast(activity),
  );

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          Hosting
        </h1>
        <span className="flex flex-wrap gap-2">
          <Link href="/host/quick" className={buttonClass("primary")}>
            ⚡ Quick plan
          </Link>
          <Link href="/host/new" className={buttonClass("secondary")}>
            + Full activity
          </Link>
        </span>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState
          emoji="🥳"
          title="Nothing coming up"
          body="Create your first activity. It takes about a minute."
        />
      ) : (
        <div className="stagger-fade space-y-3">
          {upcoming.map(({ activity }) => (
            <div key={activity.id} className="space-y-1">
              <ActivityCard
                activity={activity}
                going={activity.goingCount}
                compact
              />
              <p className="flex gap-4 px-3 text-sm">
                <Link href={`/host/${activity.id}`} className={TEXT_LINK}>
                  Manage
                </Link>
                <Link href={`/host/${activity.id}/edit`} className={TEXT_LINK}>
                  Edit
                </Link>
              </p>
            </div>
          ))}
        </div>
      )}
      {mine.length > upcoming.length && (
        <p className="text-sm text-soft">
          Past and cancelled activities are under{" "}
          <Link
            href="/u/me"
            className="font-semibold text-brand-700 hover:underline"
          >
            your profile
          </Link>
          .
        </p>
      )}
    </div>
  );
}

const STAGE_LABEL = {
  held: "Held by NokNok until the activity ends",
  pending: "Activity ended. Payout on its way",
  paid: "Paid out to you",
  refunded: "Cancelled. Everyone was refunded",
};

function PayoutTimeline({ row }: { row: EarningsRow }) {
  const steps = [
    { label: "Collected from joiners", done: row.tickets > 0 },
    {
      label: "Activity ends, money released",
      done: row.stage === "pending" || row.stage === "paid",
    },
    {
      label: `Paid out to you (${formatDate(row.payoutAt)})`,
      done: row.stage === "paid",
    },
  ];
  return (
    <section
      aria-labelledby="earnings-heading"
      className="glass-card space-y-3 rounded-3xl p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="earnings-heading" className="text-lg font-bold text-ink">
          Earnings
        </h2>
        <p className="text-xl font-extrabold text-ink">
          {formatInr(row.amountP)}
        </p>
      </div>
      <p className="text-sm text-soft">
        {row.tickets} ticket{row.tickets === 1 ? "" : "s"} ·{" "}
        {STAGE_LABEL[row.stage]}
      </p>
      {row.stage !== "refunded" && (
        <ol className="space-y-2">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done ? "bg-success text-white" : "bg-ink/10 text-muted"
                }`}
              >
                {step.done ? "✓" : ""}
              </span>
              <span
                className={step.done ? "font-semibold text-ink" : "text-muted"}
              >
                {step.label}
                <span className="sr-only">
                  {step.done ? " (done)" : " (not yet)"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {!IS_PRODUCTION && (
        <p className="text-xs text-muted">
          Mock figures: no real money moves in the prototype.
        </p>
      )}
    </section>
  );
}

// /host/:id: the host's dashboard for one activity.
export function HostManage({ id }: { id: string }) {
  const { me: host, loaded } = useMe();
  const { data, error, refetch } = useHostManage(id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [checking, setChecking] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  if (!loaded) return <HostSkeleton />;
  if (!host) return <LoginPrompt next={`/host/${id}`} />;
  if (error) {
    if (error.code === "NOT_LOGGED_IN")
      return <LoginPrompt next={`/host/${id}`} />;
    if (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")
      return <NotYours />;
    return <LoadFailed message={error.message} retry={refetch} />;
  }
  if (data === undefined) return <HostSkeleton />;

  const { activity, going, waitlist, earnings } = data;
  const spotsLeft = Math.max(activity.capacity - going.length, 0);
  const cancelled = activity.status === "cancelled";
  const past = isPast(activity);
  const live = !cancelled && !past;
  const checkedIn = going.filter(({ join }) => join.checkedInAt).length;

  const copyInvite = async () => {
    const url = `${window.location.origin}/party/${id}?ref=${host.id}&invite=${activity.inviteToken ?? ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  const submitCheckIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!ticketId.trim()) return;
    setChecking(true);
    const result = await checkIn(id, ticketId);
    setChecking(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    if (result.data.result === "ok") {
      toast("Checked in ✓");
      setTicketId("");
    } else if (result.data.result === "already")
      toast("That ticket was already checked in");
    else toast("No ticket with that id for this activity");
  };

  const approve = async (joinId: string) => {
    setApproving(joinId);
    const result = await approveWaitlist(joinId);
    setApproving(null);
    if (!result.ok) {
      if (isTransient(result.code)) toast(result.message);
      else refetch();
    } else if (result.data.approved) toast("Spot given");
  };

  const cancel = async () => {
    setCancelling(true);
    const result = await cancelActivity(id);
    setCancelling(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setConfirmCancel(false);
    toast("Activity cancelled");
  };

  const person = (
    { join, user }: JoinWithUser,
    note: string,
    action?: ReactNode,
  ) => <UserRow key={join.id} user={user} note={note} action={action} />;

  return (
    <div className={PAGE}>
      <header className="stagger space-y-2">
        <p className="text-sm font-semibold text-brand-700">
          {cancelled ? "Cancelled" : past ? "Ended" : "Live"} ·{" "}
          {formatDateTime(activity.startsAt)}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          {activity.title}
        </h1>
        <p className="text-soft">
          {cancelled
            ? "This activity is cancelled. Everyone who had joined was notified."
            : `${going.length}/${activity.capacity} going${
                past ? "" : ` · ${plural(spotsLeft, "spot")} left`
              }${waitlist.length > 0 ? ` · ${waitlist.length} on waitlist` : ""}`}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/party/${id}`} className={buttonClass("secondary")}>
            View page
          </Link>
          {live && (
            <>
              <Button variant="secondary" onClick={copyInvite}>
                Copy invite link
              </Button>
              <Link
                href={`/host/${id}/edit`}
                className={buttonClass("secondary")}
              >
                Edit
              </Link>
              <Button
                variant="ghost"
                onClick={() => {
                  // Joins made from other devices since this page loaded
                  // change what the dialog says about refunds: fetch first.
                  void refetch();
                  setConfirmCancel(true);
                }}
              >
                Cancel activity
              </Button>
            </>
          )}
        </div>
      </header>

      {activity.priceP > 0 && earnings && <PayoutTimeline row={earnings} />}

      <section aria-labelledby="attendees-heading" className="space-y-3">
        <h2 id="attendees-heading" className="text-lg font-bold text-ink">
          Attendees ({going.length})
          {checkedIn > 0 && ` · ${checkedIn} checked in`}
        </h2>
        {!cancelled && going.length > 0 && (
          <form onSubmit={submitCheckIn} className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Check in by ticket id"
                value={ticketId}
                onChange={(event) => setTicketId(event.target.value)}
                placeholder="TK-AB12CD"
                autoCapitalize="characters"
              />
            </div>
            <Button type="submit" loading={checking}>
              Check in
            </Button>
          </form>
        )}
        {going.length === 0 ? (
          <p className="text-sm text-soft">
            {cancelled
              ? "No one is attending: the activity was cancelled."
              : past
                ? "Nobody joined this one."
                : "Nobody has joined yet. Share your invite link to get the first few in."}
          </p>
        ) : (
          <div className="space-y-2">
            {going.map((entry) =>
              person(
                entry,
                `${entry.join.id}${
                  entry.inviter
                    ? ` · invited by ${entry.inviter.name.split(" ")[0]}`
                    : ""
                }`,
                entry.join.checkedInAt ? (
                  <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                    Checked in ✓
                  </span>
                ) : live ? (
                  <RemoveAttendee
                    activityId={id}
                    user={entry.user}
                    paid={entry.join.ticketP + entry.join.feeP > 0}
                  />
                ) : undefined,
              ),
            )}
          </div>
        )}
      </section>

      {waitlist.length > 0 && (
        <section aria-labelledby="waitlist-heading" className="space-y-3">
          <h2 id="waitlist-heading" className="text-lg font-bold text-ink">
            Waitlist ({waitlist.length})
          </h2>
          <p className="text-sm text-soft">
            {activity.waitlistMode === "auto"
              ? "The first person in line gets a spot automatically when someone leaves."
              : spotsLeft > 0
                ? "You approve who gets a free spot."
                : "You approve who gets a spot. It's full now: a spot has to open first."}
          </p>
          <div className="space-y-2">
            {waitlist.map((entry, index) =>
              person(
                entry,
                `#${index + 1} in line`,
                activity.waitlistMode === "approval" && live ? (
                  <Button
                    className="shrink-0"
                    disabled={spotsLeft === 0}
                    loading={approving === entry.join.id}
                    onClick={() => approve(entry.join.id)}
                  >
                    Approve
                  </Button>
                ) : undefined,
              ),
            )}
          </div>
        </section>
      )}

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this activity?"
      >
        <p className="text-sm text-soft">
          {going.length === 0
            ? "Nobody has joined yet. The page will show it as cancelled."
            : `${going.length === 1 ? "The 1 person" : `All ${going.length} people`} who joined will be notified${
                activity.priceP > 0 ? " and refunded in full" : ""
              }. This can't be undone.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={cancel} loading={cancelling}>
            Yes, cancel it
          </Button>
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
