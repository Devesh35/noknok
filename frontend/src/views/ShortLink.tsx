"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useShortCode } from "@/api";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";

// /p/AB12CD -> /party/:id, keeping any ?ref= / ?invite= on the link.
export function ShortLink({ code }: { code: string }) {
  const router = useRouter();
  const query = useSearchParams().toString();
  const { data, error, refetch } = useShortCode(code);
  const target = data ? `/party/${data.activityId}${query ? `?${query}` : ""}` : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (error?.code === "NOT_FOUND") {
    return (
      <EmptyState
        page
        emoji="🔗"
        title="This link doesn't lead anywhere"
        body="The code may be mistyped, or the activity was created on another device."
        action={
          <Link href="/" className={buttonClass("primary")}>
            Explore activities
          </Link>
        }
      />
    );
  }
  if (error) {
    return (
      <EmptyState
        page
        emoji="📡"
        title="Couldn't open this link"
        body={error.message}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-64 w-full rounded-[2rem]" />
      <Skeleton className="h-7 w-2/3" />
    </div>
  );
}
