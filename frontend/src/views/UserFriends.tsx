"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  acceptFriendRequest,
  removeFriendship,
  sendFriendRequest,
  usePeople,
  type ErrorCode,
  type Result,
} from "@/api";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import { toast } from "@/lib/toast";
import type { FriendRequest, ProfileDto, User } from "@/lib/types";

type FriendsTab = "friends" | "requests" | "find";

export const LIST_GRID = "stagger-fade grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3";

const TRANSIENT = new Set<ErrorCode>(["NETWORK", "SERVER", "RATE_LIMITED"]);

// Buttons on a profile have no room for an inline failure state, so a failed
// action tells the user once; the screen refetches to whatever is true.
export function failed(result: Result<unknown>): boolean {
  if (result.ok) return false;
  toast(TRANSIENT.has(result.code) ? result.message : "That didn't go through. Try again.");
  return true;
}

// Where the viewer stands with another user, as the button needs it.
export type Relationship =
  | { kind: "none" }
  | { kind: "friends" }
  | { kind: "sent" }
  | { kind: "received"; requestId: string };

export function relationshipOf(
  viewerId: string,
  isFriend: boolean,
  request: FriendRequest | null,
): Relationship {
  if (isFriend) return { kind: "friends" };
  if (!request || request.status !== "pending") return { kind: "none" };
  if (request.fromId === viewerId) return { kind: "sent" };
  return { kind: "received", requestId: request.id };
}

// The right button for the relationship between the viewer and another user.
export function FriendAction({
  viewer,
  other,
  relationship,
  autoAccept = false,
}: {
  viewer: User | null;
  other: User;
  relationship: Relationship;
  // The /dev knob that accepts requests instantly, so the toast can say so.
  autoAccept?: boolean;
}) {
  if (viewer?.id === other.id) return null;
  if (!viewer) {
    return (
      <Link
        href={`/login?next=/u/${other.handle}`}
        className={buttonClass("primary", "shrink-0")}
      >
        Add friend
      </Link>
    );
  }
  if (relationship.kind === "none") {
    return (
      <Button
        className="shrink-0"
        onClick={async () => {
          if (failed(await sendFriendRequest(other.id))) return;
          toast(
            autoAccept
              ? `You and ${other.name} are now friends`
              : `Friend request sent to ${other.name}`,
          );
        }}
      >
        Add friend
      </Button>
    );
  }
  if (relationship.kind === "friends") {
    return (
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={async () => {
          if (failed(await removeFriendship(other.id))) return;
          toast(`Removed ${other.name} from friends`);
        }}
      >
        Friends ✓
      </Button>
    );
  }
  if (relationship.kind === "sent") {
    return (
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={async () => {
          if (failed(await removeFriendship(other.id))) return;
          toast("Request withdrawn");
        }}
      >
        Requested
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 gap-2">
      <Button
        onClick={async () => {
          failed(await acceptFriendRequest(relationship.requestId));
        }}
      >
        Accept
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          failed(await removeFriendship(other.id));
        }}
      >
        Decline
      </Button>
    </span>
  );
}

// Search results for the "Find people" tab. Nothing is listed until the
// viewer types: the server does the searching.
function PeopleSearch({
  query,
  viewer,
  autoAccept,
}: {
  query: string;
  viewer: User;
  autoAccept: boolean;
}) {
  const { data, error, isPending, refetch } = usePeople(query);
  if (query.trim() === "") {
    return <EmptyState emoji="🔍" title="Search for someone by name or @handle" />;
  }
  if (isPending) {
    return (
      <div className={LIST_GRID}>
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-16 w-full rounded-3xl" />
      </div>
    );
  }
  if (!data) {
    return (
      <EmptyState
        emoji="📡"
        title="Couldn't search right now"
        body={error?.message}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }
  const people = data.items.filter((person) => person.user.id !== viewer.id);
  if (people.length === 0) return <EmptyState emoji="🔍" title="No one matches that search" />;
  return (
    <div className={LIST_GRID}>
      {people.map((person) => (
        <UserRow
          key={person.user.id}
          user={person.user}
          note={
            person.mutualCount > 0
              ? `${person.mutualCount} mutual friend${person.mutualCount === 1 ? "" : "s"}`
              : undefined
          }
          action={
            <FriendAction
              viewer={viewer}
              other={person.user}
              relationship={relationshipOf(viewer.id, person.isFriend, person.request)}
              autoAccept={autoAccept}
            />
          }
        />
      ))}
    </div>
  );
}

export function FriendsPanel({
  profile,
  viewer,
  autoAccept,
}: {
  profile: ProfileDto;
  viewer: User | null;
  autoAccept: boolean;
}) {
  const [tab, setTab] = useState<FriendsTab>("friends");
  const [query, setQuery] = useState("");
  // Typing stays instant; the search request follows a beat behind.
  const deferredQuery = useDeferredValue(query);
  const { user, isOwn, friends, mutual, incomingRequests, outgoingRequests } = profile;
  const mutualIds = isOwn ? [] : mutual.map((u) => u.id);

  const friendList =
    friends.length === 0 ? (
      <EmptyState
        emoji="🤝"
        title={isOwn ? "No friends yet" : `${user.name.split(" ")[0]} has no friends here yet`}
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
            action={
              isOwn && (
                <FriendAction
                  viewer={viewer}
                  other={friend}
                  relationship={{ kind: "friends" }}
                  autoAccept={autoAccept}
                />
              )
            }
          />
        ))}
      </div>
    );

  if (!isOwn || !viewer) return friendList;

  const requests = [
    ...incomingRequests.map((r) => ({ ...r, sentByMe: false })),
    ...outgoingRequests.map((r) => ({ ...r, sentByMe: true })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip selected={tab === "friends"} onClick={() => setTab("friends")}>
          Friends ({friends.length})
        </Chip>
        <Chip selected={tab === "requests"} onClick={() => setTab("requests")}>
          Requests ({incomingRequests.length})
        </Chip>
        <Chip selected={tab === "find"} onClick={() => setTab("find")}>
          Find people
        </Chip>
      </div>

      {tab === "friends" && friendList}

      {tab === "requests" &&
        (requests.length === 0 ? (
          <EmptyState emoji="📭" title="No pending requests" />
        ) : (
          <div className={LIST_GRID}>
            {requests.map(({ request, other, sentByMe }) => (
              <UserRow
                key={request.id}
                user={other}
                note={sentByMe ? "You sent a request" : "Wants to be friends"}
                action={
                  <FriendAction
                    viewer={viewer}
                    other={other}
                    relationship={
                      sentByMe ? { kind: "sent" } : { kind: "received", requestId: request.id }
                    }
                    autoAccept={autoAccept}
                  />
                }
              />
            ))}
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
          <PeopleSearch query={deferredQuery} viewer={viewer} autoAccept={autoAccept} />
        </div>
      )}
    </div>
  );
}
