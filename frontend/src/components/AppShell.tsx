"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { invalidateAll, useSession } from "@/api";
import { Avatar } from "@/components/Avatar";
import { buttonClass } from "@/components/Button";
import { LogoMark } from "@/components/LogoMark";
import { BellIcon, HomeIcon, PlusIcon, SearchIcon, UserIcon } from "@/components/icons";

export const FOCUS_SEARCH_EVENT = "noknok:focus-search";

const REFRESH_INTERVAL_MS = 60_000;

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 text-xl font-extrabold tracking-tight ${className}`}
    >
      <LogoMark size={32} className="shrink-0 drop-shadow-md" />
      <span className="text-gradient">NokNok</span>
    </Link>
  );
}

function UnreadDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-location px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const unread = session?.unread ?? 0;
  const loaded = session !== undefined;

  // The server sends reminders and review prompts on its own clock; refetch
  // so the badges pick them up without a reload.
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(() => void invalidateAll(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loaded]);

  // Offline fallback. Only in production builds, so it never caches dev assets.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // The Party page has its own sticky CTA bar on phones.
  const showTabs = !pathname.startsWith("/party/");
  const onProfile = pathname.startsWith("/u/");

  const tabClass = (active: boolean) =>
    `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition duration-300 active:scale-90 ${
      active ? "bg-brand-600/12 text-brand-700" : "text-muted"
    }`;
  const navLinkClass = (active: boolean) =>
    `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition duration-200 ${
      active ? "bg-brand-600/10 text-brand-700" : "text-soft hover:bg-surface-hi/70 hover:text-ink"
    }`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        style={{ viewTransitionName: "site-header" }}
        className="glass sticky top-0 z-40 hidden h-14 border-x-0 border-t-0 md:block"
      >
        <div className="flex h-full items-center gap-2 px-4 md:px-8">
          <Logo className="mr-4" />
          <Link href="/" className={navLinkClass(pathname === "/")}>
            Discover
          </Link>
          <Link href="/host" className={navLinkClass(pathname.startsWith("/host"))}>
            Host
          </Link>
          {loaded && (
            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <>
                  <Link
                    href="/notifications"
                    aria-label="Notifications"
                    className={navLinkClass(pathname === "/notifications")}
                  >
                    <span className="relative">
                      <BellIcon className="h-5 w-5" />
                      <UnreadDot count={unread} />
                    </span>
                  </Link>
                  <Link href="/u/me" className={`${navLinkClass(onProfile)} gap-2`}>
                    <Avatar user={user} size="sm" />
                    {user.name}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className={buttonClass("ghost")}>
                    Log in
                  </Link>
                  <Link href="/register" className={buttonClass("primary")}>
                    Sign up
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={`flex-1 md:pb-0 ${showTabs ? "pb-24" : ""}`}>{children}</main>

      {showTabs && (
        <nav
          aria-label="Primary"
          style={{ viewTransitionName: "tab-bar" }}
          className="glass fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md gap-1 rounded-full p-1.5 md:hidden"
        >
          <Link href="/" className={tabClass(pathname === "/")}>
            <HomeIcon className="h-5 w-5" />
            Home
          </Link>
          <Link
            href="/?search=1"
            className={tabClass(false)}
            onClick={() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))}
          >
            <SearchIcon className="h-5 w-5" />
            Search
          </Link>
          <Link href="/host" className={tabClass(pathname.startsWith("/host"))}>
            <PlusIcon className="h-5 w-5" />
            Host
          </Link>
          <Link href="/notifications" className={tabClass(pathname === "/notifications")}>
            <span className="relative">
              <BellIcon className="h-5 w-5" />
              <UnreadDot count={unread} />
            </span>
            Alerts
          </Link>
          <Link href="/u/me" className={tabClass(onProfile)}>
            <UserIcon className="h-5 w-5" />
            Profile
          </Link>
        </nav>
      )}
    </div>
  );
}
