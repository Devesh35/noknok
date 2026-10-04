"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState, ViewTransition } from "react";
import {
  acceptFriendRequest,
  activeJoin,
  activityById,
  attendanceOf,
  blockedIds,
  canView,
  earningsOf,
  friendsOf,
  goingJoins,
  graphOf,
  hostRating,
  hostedCount,
  incomingRequests,
  isPast,
  logOut,
  me,
  mutualFriends,
  removeFriendship,
  requestBetween,
  sendFriendRequest,
  settingsFor,
  ticketsOf,
  toggleBlock,
  useDb,
  userByHandle,
  userById,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Avatar } from "@/components/Avatar";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { ReportSheet } from "@/components/ReportSheet";
import { Segmented } from "@/components/Segmented";
import { Skeleton } from "@/components/Skeleton";
import { TicketCard } from "@/components/Ticket";
import { UserRow, VerifiedBadges } from "@/components/UserBits";
import { byStart } from "@/lib/activity";
import { formatInr } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Activity, Db, User } from "@/lib/types";
import { isFriend } from "@/lib/visibility";
import { waitlistPosition } from "@/lib/waitlist";

type Tab = "hosting" | "joined" | "past" | "friends";
type FriendsTab = "friends" | "requests" | "find";

const LIST_GRID = "stagger-fade grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3";
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

// The right button for the relationship between the viewer and another user.
function FriendAction({ db, viewer, other }: { db: Db; viewer: User | null; other: User }) {
  if (viewer?.id === other.id) return null;
  if (!viewer) {
    return (
      <Button onClick={() => toast("Log in to add friends")} className="shrink-0">
        Add friend
      </Button>
    );
  }
  const request = requestBetween(db, viewer.id, other.id);
  if (!request) {
    return (
      <Button
        className="shrink-0"
        onClick={() => {
          sendFriendRequest(other.id);
          toast(
            db.dev.autoAcceptFriends
              ? `You and ${other.name} are now friends`
              : `Friend request sent to ${other.name}`,
          );
        }}
      >
        Add friend
      </Button>
    );
  }
  if (request.status === "accepted") {
    return (
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={() => {
          removeFriendship(other.id);
          toast(`Removed ${other.name} from friends`);
        }}
      >
        Friends ✓
      </Button>
    );
  }
  if (request.fromId === viewer.id) {
    return (
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={() => {
          removeFriendship(other.id);
          toast("Request withdrawn");
        }}
      >
        Requested
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 gap-2">
      <Button onClick={() => acceptFriendRequest(request.id)}>Accept</Button>
      <Button variant="secondary" onClick={() => removeFriendship(other.id)}>
        Decline
      </Button>
    </span>
  );
}

function EarningsCard({ db, host }: { db: Db; host: User }) {
  const rows = earningsOf(db, host.id);
  if (rows.length === 0) return null;
  const total = (stage: string) =>
    rows.filter((row) => row.stage === stage).reduce((sum, row) => sum + row.amount, 0);
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

function FriendsPanel({
  db,
  profile,
  viewer,
  isOwn,
}: {
  db: Db;
  profile: User;
  viewer: User | null;
  isOwn: boolean;
}) {
  const [tab, setTab] = useState<FriendsTab>("friends");
  const [query, setQuery] = useState("");
  const friends = friendsOf(db, profile.id);
  const mutualIds =
    viewer && !isOwn ? mutualFriends(db, viewer.id, profile.id).map((u) => u.id) : [];

  const friendList =
    friends.length === 0 ? (
      <EmptyState
        emoji="🫂"
        title={isOwn ? "No friends yet" : `${profile.name.split(" ")[0]} has no friends here yet`}
        body={isOwn ? "Find people you know to see their friends-only plans." : undefined}
        action={isOwn && <Button onClick={() => setTab("find")}>Find people</Button>}
      />
    ) : (
      <div className={LIST_GRID}>
        {friends.map((friend) => (
          <UserRow
            key={friend.id}
            user={friend}
            note={mutualIds.includes(friend.id) ? "Mutual friend" : undefined}
            action={isOwn && <FriendAction db={db} viewer={viewer} other={friend} />}
          />
        ))}
      </div>
    );

  if (!isOwn || !viewer) return friendList;

  const incoming = incomingRequests(db, viewer.id);
  const outgoing = db.friendRequests.filter(
    (r) => r.fromId === viewer.id && r.status === "pending",
  );
  const blocked = blockedIds(db);
  const needle = query.trim().toLowerCase();
  const people = db.users.filter(
    (u) =>
      u.id !== viewer.id &&
      !blocked.includes(u.id) &&
      (needle === "" ||
        u.name.toLowerCase().includes(needle) ||
        u.handle.toLowerCase().includes(needle)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip selected={tab === "friends"} onClick={() => setTab("friends")}>
          Friends ({friends.length})
        </Chip>
        <Chip selected={tab === "requests"} onClick={() => setTab("requests")}>
          Requests ({incoming.length})
        </Chip>
        <Chip selected={tab === "find"} onClick={() => setTab("find")}>
          Find people
        </Chip>
      </div>

      {tab === "friends" && friendList}

      {tab === "requests" &&
        (incoming.length + outgoing.length === 0 ? (
          <EmptyState emoji="📭" title="No pending requests" />
        ) : (
          <div className={LIST_GRID}>
            {[...incoming, ...outgoing].map((request) => {
              const sentByMe = request.fromId === viewer.id;
              const other = userById(db, sentByMe ? request.toId : request.fromId);
              if (!other) return null;
              return (
                <UserRow
                  key={request.id}
                  user={other}
                  note={sentByMe ? "You sent a request" : "Wants to be friends"}
                  action={<FriendAction db={db} viewer={viewer} other={other} />}
                />
              );
            })}
          </div>
        ))}

      {tab === "find" && (
        <div className="space-y-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or @handle"
            aria-label="Search people"
            className="min-h-11 w-full rounded-full border border-line bg-surface/60 px-4 text-base shadow-sm outline-none transition duration-200 placeholder:text-faint focus:border-brand-600 focus:bg-surface-hi focus:ring-4 focus:ring-brand-600/15"
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => toast("Contact import arrives with the mobile app")}
          >
            📇 Find friends from my contacts
          </Button>
          {people.length === 0 ? (
            <EmptyState emoji="🔍" title="No one matches that search" />
          ) : (
            <div className={LIST_GRID}>
              {people.map((person) => (
                <UserRow
                  key={person.id}
                  user={person}
                  action={<FriendAction db={db} viewer={viewer} other={person} />}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UserView({ handle }: { handle: string }) {
  const router = useRouter();
  const db = useDb();
  const [tab, setTab] = useState<Tab>("hosting");
  const [joinedView, setJoinedView] = useState<"plans" | "interested" | "tickets">("plans");
  const [reporting, setReporting] = useState(false);
  // The tab control moves instantly; the list crossfades as a transition.
  const shownTab = useDeferredValue(tab);

  const viewer = db ? me(db) : null;
  const needsLogin = handle === "me" && db !== null && !viewer;
  useEffect(() => {
    if (needsLogin) router.replace("/login?next=/u/me");
  }, [needsLogin, router]);

  if (!db || needsLogin) {
    return (
      <ViewTransition key="skeleton" exit="fade-out" default="none">
        <ProfileSkeleton />
      </ViewTransition>
    );
  }

  const profile = handle === "me" ? viewer : userByHandle(db, handle);
  if (!profile) {
    return (
      <ViewTransition key="missing" enter="fade-in" default="none">
        <div>
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
        </div>
      </ViewTransition>
    );
  }

  const isOwn = viewer?.id === profile.id;
  const firstName = profile.name.split(" ")[0];
  const friends = friendsOf(db, profile.id);
  const mutual = viewer && !isOwn ? mutualFriends(db, viewer.id, profile.id) : [];
  const { rating } = hostRating(db, profile.id);
  const isBlocked = blockedIds(db).includes(profile.id);

  // Other people's plans are subject to their privacy setting, and to each
  // activity's own visibility.
  const privacy = settingsFor(db, profile.id).joinedVisibility;
  const mayPeek =
    isOwn ||
    privacy === "everyone" ||
    (privacy === "friends" && viewer !== null && isFriend(graphOf(db), viewer.id, profile.id));
  const visible = (activity: Activity) =>
    isOwn || (activity.status === "active" && canView(db, activity));

  const hosted = db.activities.filter((a) => a.hostId === profile.id && visible(a));
  const joined = mayPeek
    ? db.activities.filter((a) => activeJoin(db, a.id, profile.id) && visible(a))
    : [];
  const lists: Record<Exclude<Tab, "friends">, Activity[]> = {
    hosting: hosted.filter((a) => !isPast(a)).sort(byStart),
    joined: joined.filter((a) => !isPast(a)).sort(byStart),
    past: [...hosted, ...joined].filter(isPast).sort(byStart).reverse(),
  };
  const tickets = isOwn ? ticketsOf(db, profile.id) : [];
  // Plans the user marked "interested" but hasn't joined.
  const interested = isOwn
    ? db.interested
        .filter((i) => i.userId === profile.id)
        .map((i) => activityById(db, i.activityId))
        .filter((a): a is Activity => a !== undefined && a.status === "active" && !isPast(a))
        .sort(byStart)
    : [];
  const attendance = attendanceOf(db, profile.id);

  const who = isOwn ? "You haven't" : `${firstName} hasn't`;
  const empty: Record<Exclude<Tab, "friends">, { emoji: string; title: string }> = {
    hosting: { emoji: "📣", title: `${who} got anything coming up to host` },
    joined: mayPeek
      ? { emoji: "🎟️", title: `${who} joined anything yet` }
      : { emoji: "🙈", title: `${firstName} keeps their plans private` },
    past: { emoji: "🕰️", title: "No past activities yet" },
  };

  const stats = [
    { label: "Hosted", value: String(hostedCount(db, profile.id)) },
    { label: "Friends", value: String(friends.length) },
    { label: "Rating", value: rating > 0 ? `★ ${rating.toFixed(1)}` : "New" },
    { label: "Shows up", value: attendance === null ? "New" : `${attendance}%` },
  ];
  const tabs: { value: Tab; label: string }[] = [
    { value: "hosting", label: `Hosting (${lists.hosting.length})` },
    { value: "joined", label: `Joined (${lists.joined.length})` },
    { value: "past", label: `Past (${lists.past.length})` },
    { value: "friends", label: `Friends (${friends.length})` },
  ];

  const noteFor = (activity: Activity) => {
    const join = activeJoin(db, activity.id, profile.id);
    return join?.status === "waitlisted"
      ? `Waitlist #${waitlistPosition(db.joins, join.id)}`
      : undefined;
  };

  const logOutAndLeave = () => {
    logOut();
    router.push("/");
  };

  let panel;
  if (shownTab === "friends") {
    panel = <FriendsPanel db={db} profile={profile} viewer={viewer} isOwn={isOwn} />;
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
          {interested.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              going={goingJoins(db, activity.id).length}
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
          {tickets.map((join) => {
            const activity = activityById(db, join.activityId);
            return activity ? (
              <TicketCard key={join.id} join={join} activity={activity} holder={profile} />
            ) : null;
          })}
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
          {list.map((activity) => (
            <div key={activity.id} className="space-y-1">
              <ActivityCard
                activity={activity}
                going={goingJoins(db, activity.id).length}
                note={noteFor(activity)}
                compact
              />
              {isOwn && activity.hostId === profile.id && (
                <p className="flex gap-4 px-3 text-sm font-semibold">
                  <Link href={`/host/${activity.id}`} className={TEXT_LINK}>
                    Manage
                  </Link>
                  {activity.status === "active" && !isPast(activity) && (
                    <Link href={`/host/${activity.id}/edit`} className={TEXT_LINK}>
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
              {stats.map((stat) => (
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
                  <FriendAction db={db} viewer={viewer} other={profile} />
                  {viewer && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        toggleBlock(profile.id);
                        toast(isBlocked ? `Unblocked ${profile.name}` : `Blocked ${profile.name}`);
                      }}
                    >
                      {isBlocked ? "Unblock" : "Block"}
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

        {isOwn && <EarningsCard db={db} host={profile} />}

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
