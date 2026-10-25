"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState, ViewTransition } from "react";
import { logOut, toggleBlock, useProfile, useSession } from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { PlusIcon } from "@/components/icons";
import { ReportSheet } from "@/components/ReportSheet";
import { Segmented } from "@/components/Segmented";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { TicketCard } from "@/components/Ticket";
import { formatInr } from "@/lib/format";
import { now } from "@/lib/time";
import { IS_PRODUCTION } from "@/lib/env";
import { toast } from "@/lib/toast";
import type { ActivityCardItem, EarningsRow, PayoutStage } from "@/lib/types";
import { UserHeader } from "@/views/UserHeader";
import { failed, FriendsPanel, LIST_GRID } from "@/views/UserFriends";

type Tab = "hosting" | "joined" | "liked" | "past" | "friends";

const TEXT_LINK = "inline-flex min-h-11 items-center text-brand-700 hover:underline";

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 md:px-8">
      <Skeleton className="h-64 w-full rounded-[2rem]" />
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-24 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  );
}

function EarningsCard({ rows }: { rows: EarningsRow[] }) {
  if (rows.length === 0) return null;
  const total = (stage: PayoutStage) =>
    rows.filter((row) => row.stage === stage).reduce((sum, row) => sum + row.amountP, 0);
  const stats = [
    { label: "Held until event ends", value: total("held") },
    { label: "Payout pending (T+2)", value: total("pending") },
    { label: "Paid out", value: total("paid") },
  ];
  return (
    <section
      aria-labelledby="earnings-heading"
      className="glass-card mt-6 animate-rise rounded-3xl p-4"
    >
      <h2 id="earnings-heading" className="text-lg font-bold text-ink">
        Earnings
      </h2>
      <p className="text-xs text-muted">
        NokNok holds ticket money until the activity ends, then pays you out two days later.
        {!IS_PRODUCTION && " Mock figures: no real money moves."}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-line bg-surface/50 px-2 py-3">
            <dd className="text-lg font-bold text-ink">{formatInr(stat.value)}</dd>
            <dt className="text-xs text-muted">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Short status shown on a card instead of the going count.
function noteFor(item: ActivityCardItem): string | undefined {
  return item.myJoin?.status === "waitlisted" ? `Waitlist #${item.waitlistPosition}` : undefined;
}

function isPast(item: ActivityCardItem): boolean {
  return Date.parse(item.activity.endsAt) < now();
}

export function UserView({ handle }: { handle: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, error, isPending, refetch } = useProfile(handle);
  const [tab, setTab] = useState<Tab>("hosting");
  const [joinedView, setJoinedView] = useState<"plans" | "tickets">("plans");
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  // The tab control moves instantly; the list crossfades as a transition.
  const shownTab = useDeferredValue(tab);

  const viewer = session?.user ?? null;
  const autoAccept = session?.dev.autoAcceptFriends ?? false;
  // proxy.ts redirects /u/me before it renders; this covers a session that
  // expired while the tab was open.
  const needsLogin = handle === "me" && error?.code === "NOT_LOGGED_IN";
  useEffect(() => {
    if (needsLogin) router.replace("/login?next=/u/me");
  }, [needsLogin, router]);

  if (isPending || needsLogin) {
    return (
      <ViewTransition key="skeleton" exit="fade-out" default="none">
        <ProfileSkeleton />
      </ViewTransition>
    );
  }

  if (!data) {
    return (
      <ViewTransition key="missing" enter="fade-in" default="none">
        <div>
          {error?.code === "NOT_FOUND" ? (
            <EmptyState
              page
              emoji="🤷"
              title="User not found"
              body={`There's no one here with the handle @${handle}.`}
              action={
                <Link href="/" className={buttonClass("primary")}>
                  Explore activities
                </Link>
              }
            />
          ) : (
            <EmptyState
              page
              emoji="📡"
              title="Couldn't load this profile"
              body={error?.message}
              action={<Button onClick={() => refetch()}>Try again</Button>}
            />
          )}
        </div>
      </ViewTransition>
    );
  }

  const { user: profile, isOwn, relationship, friends } = data;
  const firstName = profile.name.split(" ")[0];
  const lists: Record<Exclude<Tab, "friends" | "liked">, ActivityCardItem[]> = {
    hosting: data.hosting,
    joined: data.joined,
    past: data.past,
  };
  const { tickets, interested, earnings } = data;

  const who = isOwn ? "You haven't" : `${firstName} hasn't`;
  const empty: Record<Exclude<Tab, "friends" | "liked">, { emoji: string; title: string }> = {
    hosting: { emoji: "📣", title: `${who} got anything coming up to host` },
    joined: data.joinedHidden
      ? { emoji: "🙈", title: `${data.user.name} keeps their plans private` }
      : { emoji: "🎟️", title: `${who} joined anything yet` },
    past: { emoji: "🕰️", title: "No past activities yet" },
  };

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "hosting", label: "Hosting", count: lists.hosting.length },
    { value: "joined", label: "Joined", count: lists.joined.length },
    ...(isOwn ? [{ value: "liked" as const, label: "Liked", count: interested.length }] : []),
    { value: "past", label: "Past", count: lists.past.length },
    { value: "friends", label: "Friends", count: friends.length },
  ];

  const logOutAndLeave = async () => {
    if (failed(await logOut())) return;
    router.push("/");
  };

  // Blocking asks first; unblocking applies straight away.
  const block = async () => {
    setBlocking(true);
    const result = await toggleBlock(profile.id);
    setBlocking(false);
    setConfirmBlock(false);
    if (failed(result) || !result.ok) return;
    toast(result.data.blocked ? `Blocked ${profile.name}` : `Unblocked ${profile.name}`);
  };

  let panel;
  if (shownTab === "friends") {
    panel = <FriendsPanel profile={data} viewer={viewer} autoAccept={autoAccept} />;
  } else if (shownTab === "liked") {
    panel =
      interested.length === 0 ? (
        <EmptyState
          emoji="♡"
          title="Nothing saved yet"
          body="Tap the heart on a plan you might go to. It waits here until you decide."
        />
      ) : (
        <div className={LIST_GRID}>
          {interested.map((item) => (
            <ActivityCard
              key={item.activity.id}
              activity={item.activity}
              going={item.activity.goingCount}
              compact
            />
          ))}
        </div>
      );
  } else if (shownTab === "joined" && joinedView === "tickets" && isOwn) {
    panel =
      tickets.length === 0 ? (
        <EmptyState emoji="🎟️" title="No tickets yet" />
      ) : (
        <div className={LIST_GRID}>
          {tickets.map(({ join, activity }) => (
            <TicketCard key={join.id} join={join} activity={activity} holder={profile} />
          ))}
        </div>
      );
  } else {
    const list = lists[shownTab];
    panel =
      list.length === 0 ? (
        <EmptyState
          emoji={empty[shownTab].emoji}
          title={empty[shownTab].title}
          action={
            isOwn && (
              <Link
                href={shownTab === "hosting" ? "/host/new" : "/"}
                className={buttonClass("primary")}
              >
                <PlusIcon className="h-4 w-4" />
                {shownTab === "hosting" ? "Host something" : "Explore"}
              </Link>
            )
          }
        />
      ) : (
        <div className={LIST_GRID}>
          {list.map((item) => (
            <div key={item.activity.id} className="space-y-1">
              <ActivityCard
                activity={item.activity}
                going={item.activity.goingCount}
                note={noteFor(item)}
                compact
              />
              {isOwn && item.activity.hostId === profile.id && (
                <p className="flex gap-4 px-3 text-sm font-semibold">
                  <Link href={`/host/${item.activity.id}`} className={TEXT_LINK}>
                    Manage
                  </Link>
                  {item.activity.status === "active" && !isPast(item) && (
                    <Link href={`/host/${item.activity.id}/edit`} className={TEXT_LINK}>
                      Edit
                    </Link>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      );
  }

  return (
    <ViewTransition key="content" enter="fade-in" default="none">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <UserHeader
          data={data}
          viewer={viewer}
          autoAccept={autoAccept}
          blocking={blocking && !confirmBlock}
          onLogOut={logOutAndLeave}
          onBlock={() => (relationship.blocked ? block() : setConfirmBlock(true))}
          onReport={() => setReporting(true)}
        />

        {isOwn && <EarningsCard rows={earnings} />}

        <Segmented
          label="Profile sections"
          value={tab}
          onChange={setTab}
          options={tabs}
          className="mt-5"
        />

        {isOwn && shownTab === "joined" && (
          <div className="flex flex-wrap gap-2 pt-4">
            <Chip selected={joinedView === "plans"} onClick={() => setJoinedView("plans")}>
              Going
            </Chip>
            <Chip selected={joinedView === "tickets"} onClick={() => setJoinedView("tickets")}>
              My tickets ({tickets.length})
            </Chip>
          </div>
        )}

        <ViewTransition key={shownTab} enter="fade-in" exit="fade-out" default="none">
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${shownTab}`} className="pt-4">
            {panel}
          </div>
        </ViewTransition>

        {!isOwn && (
          <ReportSheet
            open={reporting}
            onClose={() => setReporting(false)}
            targetType="user"
            targetId={profile.id}
            name={profile.name}
          />
        )}
        {!isOwn && (
          <Sheet
            open={confirmBlock}
            onClose={() => setConfirmBlock(false)}
            title={`Block ${profile.name}?`}
          >
            <p className="text-sm text-soft">
              They won&apos;t be able to see your plans or send you friend
              requests, and you won&apos;t see theirs. You can unblock them from
              Settings.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button onClick={block} loading={blocking}>
                Block
              </Button>
              <Button variant="secondary" onClick={() => setConfirmBlock(false)}>
                Cancel
              </Button>
            </div>
          </Sheet>
        )}
      </div>
    </ViewTransition>
  );
}
