"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState, ViewTransition } from "react";
import { logOut, toggleBlock, useProfile, useSession } from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Avatar } from "@/components/Avatar";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ReportSheet } from "@/components/ReportSheet";
import { Segmented } from "@/components/Segmented";
import { Skeleton } from "@/components/Skeleton";
import { TicketCard } from "@/components/Ticket";
import { VerifiedBadges } from "@/components/UserBits";
import { formatInr } from "@/lib/format";
import { now } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { ActivityCardItem, EarningsRow, PayoutStage } from "@/lib/types";
import { failed, FriendAction, FriendsPanel, LIST_GRID, relationshipOf } from "@/views/UserFriends";

type Tab = "hosting" | "joined" | "past" | "friends";

const TEXT_LINK = "inline-flex min-h-11 items-center text-brand-700 hover:underline";

function ProfileSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
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
        Mock figures: no real money moves.
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
  const [joinedView, setJoinedView] = useState<"plans" | "interested" | "tickets">("plans");
  const [reporting, setReporting] = useState(false);
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

  const { user: profile, stats, isOwn, relationship, friends, mutual } = data;
  const firstName = profile.name.split(" ")[0];
  const lists: Record<Exclude<Tab, "friends">, ActivityCardItem[]> = {
    hosting: data.hosting,
    joined: data.joined,
    past: data.past,
  };
  const { tickets, interested, earnings } = data;

  const who = isOwn ? "You haven't" : `${firstName} hasn't`;
  const empty: Record<Exclude<Tab, "friends">, { emoji: string; title: string }> = {
    hosting: { emoji: "📣", title: `${who} got anything coming up to host` },
    joined: data.joinedHidden
      ? { emoji: "🙈", title: `${data.user.name} keeps their plans private` }
      : { emoji: "🎟️", title: `${who} joined anything yet` },
    past: { emoji: "🕰️", title: "No past activities yet" },
  };

  const statRows = [
    { label: "Hosted", value: String(stats.hostedCount) },
    { label: "Friends", value: String(friends.length) },
    { label: "Rating", value: stats.rating > 0 ? `★ ${stats.rating.toFixed(1)}` : "New" },
    { label: "Shows up", value: stats.attendance === null ? "New" : `${stats.attendance}%` },
  ];
  const tabs: { value: Tab; label: string }[] = [
    { value: "hosting", label: `Hosting (${lists.hosting.length})` },
    { value: "joined", label: `Joined (${lists.joined.length})` },
    { value: "past", label: `Past (${lists.past.length})` },
    { value: "friends", label: `Friends (${friends.length})` },
  ];

  const logOutAndLeave = async () => {
    if (failed(await logOut())) return;
    router.push("/");
  };

  const block = async () => {
    const result = await toggleBlock(profile.id);
    if (failed(result) || !result.ok) return;
    toast(result.data.blocked ? `Blocked ${profile.name}` : `Unblocked ${profile.name}`);
  };

  let panel;
  if (shownTab === "friends") {
    panel = <FriendsPanel profile={data} viewer={viewer} autoAccept={autoAccept} />;
  } else if (shownTab === "joined" && joinedView === "interested" && isOwn) {
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
      <div className="px-4 py-6 md:px-8">
        <header className="glass-card animate-rise overflow-hidden rounded-[2rem]">
          <div className="relative h-28 overflow-hidden bg-linear-to-r from-brand-600 to-accent">
            <span className="absolute -top-10 left-1/4 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
            <span className="absolute right-0 -bottom-12 h-32 w-48 rounded-full bg-black/15 blur-2xl" />
          </div>
          <div className="-mt-10 space-y-4 px-4 pb-4">
            <Avatar user={profile} size="lg" className="relative animate-pop shadow-lg ring-4" />
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight text-ink">
                <span className="truncate">{profile.name}</span>
                <VerifiedBadges user={profile} />
              </h1>
              <p className="truncate text-sm text-muted">
                @{profile.handle} · {profile.city}
              </p>
              {mutual.length > 0 && (
                <p className="text-sm font-medium text-brand-700">
                  {mutual.length} mutual friend{mutual.length === 1 ? "" : "s"}:{" "}
                  {mutual.map((u) => u.name.split(" ")[0]).join(", ")}
                </p>
              )}
            </div>
            <p className="text-body">{profile.bio}</p>
            <dl className="grid grid-cols-4 rounded-3xl border border-line bg-surface/50 py-3 text-center">
              {statRows.map((stat) => (
                <div key={stat.label}>
                  <dd className="text-lg font-bold text-ink">{stat.value}</dd>
                  <dt className="text-xs text-muted">{stat.label}</dt>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {isOwn ? (
                <>
                  <Link href="/settings" className={buttonClass("secondary", "flex-1")}>
                    Edit profile &amp; settings
                  </Link>
                  <Button variant="ghost" onClick={logOutAndLeave}>
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <FriendAction
                    viewer={viewer}
                    other={profile}
                    relationship={
                      viewer
                        ? relationshipOf(viewer.id, relationship.isFriend, relationship.request)
                        : { kind: "none" }
                    }
                    autoAccept={autoAccept}
                  />
                  {viewer && (
                    <Button variant="ghost" onClick={block}>
                      {relationship.blocked ? "Unblock" : "Block"}
                    </Button>
                  )}
                  {viewer && (
                    <Button variant="ghost" onClick={() => setReporting(true)}>
                      Report
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {isOwn && <EarningsCard rows={earnings} />}

        <Segmented
          label="Profile sections"
          value={tab}
          onChange={setTab}
          options={tabs}
          className="mt-6"
        />

        {isOwn && shownTab === "joined" && (
          <div className="flex flex-wrap gap-2 pt-4">
            <Chip selected={joinedView === "plans"} onClick={() => setJoinedView("plans")}>
              Going
            </Chip>
            <Chip
              selected={joinedView === "interested"}
              onClick={() => setJoinedView("interested")}
            >
              Interested ({interested.length})
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
      </div>
    </ViewTransition>
  );
}
