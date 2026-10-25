"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { invalidateAll, useSession } from "@/api";
import { Avatar } from "@/components/Avatar";
import { buttonClass } from "@/components/Button";
import { LogoMark } from "@/components/LogoMark";
import {
  BellIcon,
  ChevronDownIcon,
  HomeIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/icons";

export const FOCUS_SEARCH_EVENT = "noknok:focus-search";

const REFRESH_INTERVAL_MS = 60_000;

// Width of the desktop sidebar; <main> is offset by the same amount.
const SIDEBAR_CLASS = "md:pl-64";

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

export function UnreadDot({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={`absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-location px-1 text-[10px] font-bold text-white ring-2 ring-canvas-2 ${className}`}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

// Bell and account pill (or Log in / Sign up) for the desktop header. Home
// renders it in its own sticky row so the desktop chrome is one line there.
export function HeaderAccount({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const unread = session?.unread ?? 0;
  if (session === undefined) return null;
  const onAlerts = pathname === "/notifications";
  const onProfile =
    pathname === "/u/me" ||
    pathname === "/settings" ||
    (user !== null && pathname === `/u/${user.handle}`);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {user ? (
        <>
          <Link
            href="/notifications"
            aria-label="Notifications"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition duration-200 ${
              onAlerts
                ? "border-brand-600/40 bg-brand-600/15 text-brand-700"
                : "border-line bg-surface/60 text-soft hover:bg-surface-hi hover:text-ink"
            }`}
          >
            <span className="relative">
              <BellIcon className="h-5 w-5" />
              <UnreadDot count={unread} />
            </span>
          </Link>
          <Link
            href="/u/me"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pr-2 pl-1 text-sm font-semibold transition duration-200 ${
              onProfile
                ? "border-brand-600/40 bg-brand-600/15 text-ink"
                : "border-line bg-surface/60 text-ink hover:bg-surface-hi"
            }`}
          >
            <Avatar user={user} size="md" className="h-8 w-8 text-xs" />
            <span className="max-w-32 truncate">{user.name}</span>
            <ChevronDownIcon className="h-4 w-4 text-muted" />
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
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const unread = session?.unread ?? 0;
  const loaded = session !== undefined;
  const loggedOut = loaded && !user;
  // Only a known signed-in user gets the sidebar, so it never flashes while
  // the session loads or for visitors.
  const showSidebar = loaded && user !== null;
  const sidebarClass = showSidebar ? SIDEBAR_CLASS : "";

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

  // The Party page and the host forms have their own sticky action bar on
  // phones, and sign-up is a focused flow: no tab bar to cover them.
  const showTabs = !(
    pathname.startsWith("/party/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname === "/host/new" ||
    pathname === "/host/quick" ||
    /^\/host\/[^/]+\/edit$/.test(pathname)
  );
  const onHome = pathname === "/";
  const onHost = pathname.startsWith("/host");
  const onAlerts = pathname === "/notifications";
  const onProfile =
    pathname === "/u/me" || (user !== null && pathname === `/u/${user.handle}`);
  const onSettings = pathname === "/settings";

  const goSearch = () => {
    router.push("/?search=1");
    window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
  };

  const sideLinkClass = (active: boolean) =>
    `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold transition duration-200 ${
      active
        ? "bg-brand-600/15 text-ink shadow-[inset_0_0_0_1px_rgb(127_79_240/0.35)]"
        : "text-soft hover:bg-surface-hi/70 hover:text-ink"
    }`;
  const sideIconClass = (active: boolean) =>
    `h-5 w-5 ${active ? "text-brand-700" : "text-muted"}`;

  const tabClass = (active: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[11px] font-semibold transition duration-300 active:scale-90 ${
      active ? "bg-brand-600/15 text-brand-700" : "text-muted"
    }`;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ---------- Desktop: left sidebar ---------- */}
      {showSidebar && (
        <aside
          aria-label="Primary"
          className="fixed inset-y-0 left-0 z-45 hidden w-64 flex-col border-r border-line bg-canvas-2/80 px-4 pt-5 pb-6 backdrop-blur-xl md:flex"
        >
          <Logo className="px-2 text-2xl" />
          <nav className="mt-8 flex flex-col gap-1">
            <Link href="/" className={sideLinkClass(onHome)}>
              <HomeIcon className={sideIconClass(onHome)} />
              Home
            </Link>
            <Link href="/host" className={sideLinkClass(onHost)}>
              <PlusIcon className={sideIconClass(onHost)} />
              Host
            </Link>
            {user && (
              <>
                <Link href="/notifications" className={sideLinkClass(onAlerts)}>
                  <BellIcon className={sideIconClass(onAlerts)} />
                  Alerts
                  {unread > 0 && (
                    <span className="ml-auto rounded-full bg-location px-2 py-0.5 text-[11px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
                <Link href="/u/me" className={sideLinkClass(onProfile)}>
                  <UserIcon className={sideIconClass(onProfile)} />
                  Profile
                </Link>
                <Link href="/settings" className={sideLinkClass(onSettings)}>
                  <SettingsIcon className={sideIconClass(onSettings)} />
                  Settings
                </Link>
              </>
            )}
          </nav>
        </aside>
      )}

      {/* ---------- Desktop: top bar ---------- */}
      <header
        style={{ viewTransitionName: "site-header" }}
        className={`glass sticky top-0 z-40 hidden h-16 border-x-0 border-t-0 ${onHome ? "" : "md:block"} ${sidebarClass}`}
      >
        <div className="flex h-full items-center gap-3 px-6">
          {loggedOut && <Logo className="shrink-0" />}
          <button
            type="button"
            onClick={goSearch}
            className="flex min-h-11 w-full max-w-md items-center gap-3 rounded-full border border-line bg-surface/60 px-4 text-left text-sm text-faint transition duration-200 hover:border-brand-600/50 hover:bg-surface-hi"
          >
            <SearchIcon className="h-5 w-5 shrink-0" />
            Search people, hangouts, or topics…
          </button>
          <HeaderAccount className="ml-auto" />
        </div>
      </header>

      <main
        className={`flex-1 md:pb-0 ${sidebarClass} ${showTabs ? "pb-28" : ""}`}
      >
        {children}
      </main>

      {/* ---------- Phones: bottom tab bar ---------- */}
      {showTabs && (
        <nav
          aria-label="Primary"
          style={{ viewTransitionName: "tab-bar" }}
          className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md gap-1 rounded-[1.75rem] p-1.5 md:hidden"
        >
          <Link href="/" className={tabClass(onHome)}>
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                onHome ? "bg-brand-600 text-white" : "bg-ink text-canvas"
              }`}
              aria-hidden="true"
            >
              N
            </span>
            Home
          </Link>
          <Link href="/host" className={tabClass(onHost)}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40">
              <PlusIcon className="h-5 w-5" />
            </span>
            Host
          </Link>
          <Link href="/notifications" className={tabClass(onAlerts)}>
            <span className="relative">
              <BellIcon className="h-6 w-6" />
              <UnreadDot count={unread} />
            </span>
            Alerts
          </Link>
          <Link href="/u/me" className={tabClass(onProfile || onSettings)}>
            <UserIcon className="h-6 w-6" />
            Profile
          </Link>
        </nav>
      )}
    </div>
  );
}
