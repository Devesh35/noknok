"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
  me,
  notificationsFor,
  useDb,
} from "@/api";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { formatAgo } from "@/lib/format";
import type { NotificationType } from "@/lib/types";

const ICONS: Record<NotificationType, string> = {
  joined: "🎟️",
  new_joiner: "🙌",
  friend_request: "👋",
  friend_accepted: "🤝",
  cancelled: "🚫",
  refund: "💸",
  waitlist_promoted: "🎉",
  waitlist_request: "⏳",
  reminder: "⏰",
  review: "⭐",
  friend_joined: "🧑‍🤝‍🧑",
  needs_people: "📣",
};

// /notifications: the in-app inbox.
export function NotificationsView() {
  const router = useRouter();
  const db = useDb();

  if (!db) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-20 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-3xl" />
      </div>
    );
  }

  const user = me(db);
  if (!user) {
    return (
      <EmptyState
        emoji="🔔"
        title="Log in to see your alerts"
        body="Join confirmations, friend requests and reminders show up here."
        action={
          <Link href="/login?next=/notifications" className={buttonClass("primary")}>
            Log in
          </Link>
        }
      />
    );
  }

  const items = notificationsFor(db, user.id);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Alerts</h1>
        {unread > 0 && (
          <Button variant="ghost" onClick={markAllNotificationsRead}>
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          emoji="🔔"
          title="You're all caught up"
          body="Join something or add a friend and it'll show up here."
        />
      ) : (
        <ul className="stagger-fade mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  markNotificationRead(item.id);
                  router.push(item.href);
                }}
                className={`flex w-full items-start gap-3 rounded-3xl p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99] ${
                  item.read ? "glass-card opacity-75" : "glass-card border-brand-600/30 bg-brand-600/8"
                }`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {ICONS[item.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {item.title}
                    {!item.read && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="block text-sm text-soft">{item.body}</span>
                  <span className="block text-xs text-muted">{formatAgo(item.createdAt)}</span>
                </span>
                {!item.read && (
                  <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
