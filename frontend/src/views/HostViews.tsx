"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  activityById,
  approveWaitlist,
  cancelActivity,
  checkIn,
  earningsOf,
  goingJoins,
  isPast,
  me,
  useDb,
  userById,
  waitlistJoins,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Field";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import { byStart } from "@/lib/activity";
import { formatDate, formatDateTime, formatInr } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Db, Join, User } from "@/lib/types";

const PAGE = "mx-auto w-full max-w-3xl space-y-6 px-4 py-6";
const TEXT_LINK = "inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline";

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
      emoji="📣"
      title="Host your own plan"
      body="Create a party, game or trek, choose who can see it, and let NokNok collect the money."
      action={
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("primary")}>
          Log in to host
        </Link>
      }
    />
  );
}

// /host: entry point to hosting.
export function HostHub() {
  const db = useDb();
  if (!db) return <HostSkeleton />;
  const host = me(db);
  if (!host) return <LoginPrompt next="/host" />;

  const mine = db.activities.filter((a) => a.hostId === host.id).sort(byStart);
  const upcoming = mine.filter((a) => a.status === "active" && !isPast(a));

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Hosting</h1>
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
          emoji="🪩"
          title="Nothing coming up"
          body="Create your first activity. It takes about a minute."
        />
      ) : (
        <div className="stagger-fade space-y-3">
          {upcoming.map((activity) => (
            <div key={activity.id} className="space-y-1">
              <ActivityCard activity={activity} going={goingJoins(db, activity.id).length} compact />
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
          <Link href="/u/me" className="font-semibold text-brand-700 hover:underline">
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

function PayoutTimeline({ db, host, activityId }: { db: Db; host: User; activityId: string }) {
  const row = earningsOf(db, host.id).find((r) => r.activity.id === activityId);
  if (!row) return null;
  const steps = [
    { label: "Collected from joiners", done: row.tickets > 0 },
    { label: "Activity ends, money released", done: row.stage === "pending" || row.stage === "paid" },
    { label: `Paid out to you (${formatDate(new Date(row.payoutAt).toISOString())})`, done: row.stage === "paid" },
  ];
  return (
    <section aria-labelledby="earnings-heading" className="glass-card space-y-3 rounded-3xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="earnings-heading" className="text-lg font-bold text-ink">
          Earnings
        </h2>
        <p className="text-xl font-extrabold text-ink">{formatInr(row.amount)}</p>
      </div>
      <p className="text-sm text-soft">
        {row.tickets} ticket{row.tickets === 1 ? "" : "s"} · {STAGE_LABEL[row.stage]}
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
              <span className={step.done ? "font-semibold text-ink" : "text-muted"}>
                {step.label}
                <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted">Mock figures: no real money moves in the prototype.</p>
    </section>
  );
}

// /host/:id: the host's dashboard for one activity.
export function HostManage({ id }: { id: string }) {
  const db = useDb();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [ticketId, setTicketId] = useState("");

  if (!db) return <HostSkeleton />;
  const host = me(db);
  if (!host) return <LoginPrompt next={`/host/${id}`} />;
  const activity = activityById(db, id);
  if (!activity || activity.hostId !== host.id) {
    return (
      <EmptyState
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

  const going = goingJoins(db, id);
  const waitlist = waitlistJoins(db, id);
  const spotsLeft = Math.max(activity.capacity - going.length, 0);
  const cancelled = activity.status === "cancelled";
  const past = isPast(activity);
  const live = !cancelled && !past;
  const checkedIn = going.filter((j) => j.checkedInAt).length;

  const copyInvite = async () => {
    const url = `${window.location.origin}/party/${id}?ref=${host.id}&invite=${activity.inviteToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  const submitCheckIn = (event: FormEvent) => {
    event.preventDefault();
    if (!ticketId.trim()) return;
    const result = checkIn(id, ticketId);
    if (result === "ok") {
      toast("Checked in ✓");
      setTicketId("");
    } else if (result === "already") toast("That ticket was already checked in");
    else toast("No ticket with that id for this activity");
  };

  const person = (join: Join, note: string, action?: ReactNode) => {
    const user = userById(db, join.userId);
    return user ? <UserRow key={join.id} user={user} note={note} action={action} /> : null;
  };

  return (
    <div className={PAGE}>
      <header className="stagger space-y-2">
        <p className="text-sm font-semibold text-brand-700">
          {cancelled ? "Cancelled" : past ? "Ended" : "Live"} · {formatDateTime(activity.startsAt)}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{activity.title}</h1>
        <p className="text-soft">
          {going.length}/{activity.capacity} going · {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left
          {waitlist.length > 0 && ` · ${waitlist.length} on waitlist`}
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
              <Link href={`/host/${id}/edit`} className={buttonClass("secondary")}>
                Edit
              </Link>
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel activity
              </Button>
            </>
          )}
        </div>
      </header>

      {activity.priceInr > 0 && <PayoutTimeline db={db} host={host} activityId={id} />}

      <section aria-labelledby="attendees-heading" className="space-y-3">
        <h2 id="attendees-heading" className="text-lg font-bold text-ink">
          Attendees ({going.length}){checkedIn > 0 && ` · ${checkedIn} checked in`}
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
            <Button type="submit">Check in</Button>
          </form>
        )}
        {going.length === 0 ? (
          <p className="text-sm text-soft">
            Nobody has joined yet. Share your invite link to get the first few in.
          </p>
        ) : (
          <div className="space-y-2">
            {going.map((join) => {
              const inviter = join.invitedBy ? userById(db, join.invitedBy) : undefined;
              return person(
                join,
                `${join.id}${inviter ? ` · invited by ${inviter.name.split(" ")[0]}` : ""}`,
                join.checkedInAt ? (
                  <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                    Checked in ✓
                  </span>
                ) : undefined,
              );
            })}
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
            {waitlist.map((join, index) =>
              person(
                join,
                `#${index + 1} in line`,
                activity.waitlistMode === "approval" && live ? (
                  <Button
                    className="shrink-0"
                    disabled={spotsLeft === 0}
                    onClick={() => {
                      if (approveWaitlist(join.id)) toast("Spot given");
                    }}
                  >
                    Approve
                  </Button>
                ) : undefined,
              ),
            )}
          </div>
        </section>
      )}

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this activity?">
        <p className="text-sm text-soft">
          {going.length === 0
            ? "Nobody has joined yet. The page will show it as cancelled."
            : `All ${going.length} people who joined will be notified${
                activity.priceInr > 0 ? " and refunded in full" : ""
              }. This can't be undone.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={() => {
              cancelActivity(id);
              setConfirmCancel(false);
              toast("Activity cancelled");
            }}
          >
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
