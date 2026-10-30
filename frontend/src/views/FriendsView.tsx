"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useProfile, useSession } from "@/api";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { FriendsPanel } from "@/views/UserFriends";

// /friends: the viewer's friends, pending requests and people search in one
// place. The same panel sits under the Friends tab of their own profile.
export function FriendsView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, error, isPending, refetch } = useProfile("me");

  const viewer = session?.user ?? null;
  const autoAccept = session?.dev.autoAcceptFriends ?? false;
  // proxy.ts redirects before render; this covers a session that expired
  // while the tab was open.
  const needsLogin = error?.code === "NOT_LOGGED_IN";
  useEffect(() => {
    if (needsLogin) router.replace("/login?next=/friends");
  }, [needsLogin, router]);

  const wrap = (body: React.ReactNode) => (
    <div className="mx-auto max-w-5xl px-4 py-4 md:px-8 md:py-6">
      <h1 className="text-[clamp(1.5rem,6vw,2.25rem)] font-extrabold tracking-tight text-ink">
        Friends
      </h1>
      <p className="mt-1 mb-5 text-base text-muted">
        Friends see your friends-only plans, and you see theirs.
      </p>
      {body}
    </div>
  );

  if (isPending || needsLogin || !viewer) {
    return wrap(
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-16 w-full rounded-3xl" />
      </div>,
    );
  }

  if (!data) {
    return wrap(
      <EmptyState
        emoji="📡"
        title="Couldn't load your friends"
        body={error?.message}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />,
    );
  }

  return wrap(<FriendsPanel profile={data} viewer={viewer} autoAccept={autoAccept} />);
}
