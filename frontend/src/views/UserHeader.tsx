"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Button, buttonClass } from "@/components/Button";
import {
  ChartIcon,
  HomeIcon,
  LogOutIcon,
  MoreIcon,
  PencilIcon,
  SettingsIcon,
  StarIcon,
  UsersIcon,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { VerifiedBadges } from "@/components/UserBits";
import type { User } from "@/lib/types";
import { FriendAction, relationshipOf } from "@/views/UserFriends";
import type { useProfile } from "@/api";

type Profile = NonNullable<ReturnType<typeof useProfile>["data"]>;

interface UserHeaderProps {
  data: Profile;
  viewer: User | null;
  autoAccept: boolean;
  blocking: boolean;
  onLogOut: () => void;
  onBlock: () => void;
  onReport: () => void;
}

interface Stat {
  label: string;
  value: string;
  icon: ReactNode;
}

// Cover art: soft spheres and a wave in the brand colours, drawn in CSS so
// it scales to any width without an image request.
function CoverArt() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-linear-to-r from-brand-600 via-[#6d5cff] to-accent"
    >
      <span className="absolute -top-24 right-[12%] h-72 w-72 rounded-full bg-linear-to-br from-sky-300/80 to-accent/40 blur-sm" />
      <span className="absolute top-8 right-[34%] h-40 w-40 rounded-full bg-linear-to-br from-violet-300/70 to-brand-500/30 blur-[2px]" />
      <span className="absolute -bottom-10 left-[30%] h-44 w-44 rounded-full bg-linear-to-br from-pink-300/70 to-location/40 blur-[2px] md:left-[40%]" />
      <span className="absolute -right-16 -bottom-24 h-72 w-72 rounded-full bg-linear-to-br from-fuchsia-300/60 to-brand-500/20 blur-[2px]" />
      <svg
        viewBox="0 0 1200 300"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[55%] w-full"
      >
        <path
          d="M0 300V160C180 110 320 120 480 150S800 230 1000 140 1200 90 1200 90V300z"
          fill="rgb(9 10 18 / 0.78)"
        />
      </svg>
      <span className="absolute inset-0 bg-linear-to-t from-canvas-2 via-transparent to-transparent" />
    </div>
  );
}

// Banner, identity, stats and actions for a profile. Phones stack everything;
// from md the actions sit on the cover beside the name.
export function UserHeader({
  data,
  viewer,
  autoAccept,
  blocking,
  onLogOut,
  onBlock,
  onReport,
}: UserHeaderProps) {
  const { user: profile, stats, isOwn, relationship, friends, mutual } = data;
  const [menu, setMenu] = useState(false);

  const statRows: Stat[] = [
    {
      label: "Hosted",
      value: String(stats.hostedCount),
      icon: <HomeIcon className="h-6 w-6 text-brand-700" fill="currentColor" strokeWidth={0} />,
    },
    {
      label: "Friends",
      value: String(friends.length),
      icon: <UsersIcon className="h-6 w-6 text-success" />,
    },
    {
      label: "Rating",
      value: stats.rating > 0 ? stats.rating.toFixed(1) : "New",
      icon: <StarIcon filled className="h-6 w-6 text-warning" />,
    },
    {
      label: "Shows up",
      value: stats.attendance === null ? "New" : `${stats.attendance}%`,
      icon: <ChartIcon className="h-6 w-6 text-accent" />,
    },
  ];

  const closeThen = (action: () => void) => () => {
    setMenu(false);
    action();
  };

  // Primary action: always visible. The rest live behind "…" on desktop and
  // sit next to the primary on phones.
  const primary = isOwn ? (
    <Link href="/settings" className={buttonClass("primary", "flex-1 md:flex-none md:px-5")}>
      <PencilIcon className="h-4 w-4" />
      Edit profile &amp; settings
    </Link>
  ) : (
    !relationship.blocked && (
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
    )
  );
  const secondaryMobile = isOwn ? (
    <Button variant="secondary" onClick={onLogOut}>
      <LogOutIcon className="h-4 w-4" />
      Log out
    </Button>
  ) : (
    viewer && (
      <Button variant="secondary" onClick={() => setMenu(true)} aria-label="More actions">
        <MoreIcon className="h-5 w-5" />
      </Button>
    )
  );
  const hasMenu = isOwn || Boolean(viewer);

  return (
    <header className="glass-card animate-rise overflow-hidden rounded-[2rem] bg-canvas-2">
      <div className="relative h-44 md:h-56">
        <CoverArt />
        {isOwn && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="glass absolute top-4 right-4 inline-flex h-12 w-12 items-center justify-center rounded-full text-ink md:hidden"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        )}
      </div>

      <div className="relative px-5 pb-5 md:px-8 md:pb-6">
        <div className="md:flex md:items-end md:gap-6">
          <div className="relative -mt-16 inline-block md:-mt-20">
            <Avatar
              user={profile}
              size="xl"
              className="animate-pop h-28 w-28 text-4xl shadow-xl ring-4 ring-canvas-2 md:h-32 md:w-32 md:text-5xl"
            />
            {isOwn && (
              <span
                className="absolute right-1.5 bottom-1.5 h-5 w-5 rounded-full bg-success ring-4 ring-canvas-2"
                title="That's you"
              >
                <span className="sr-only">That&apos;s you</span>
              </span>
            )}
          </div>
          <div className="mt-3 min-w-0 flex-1 md:mt-0 md:pb-2">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              <span className="truncate">{profile.name}</span>
              <VerifiedBadges user={profile} />
            </h1>
            <p className="mt-0.5 truncate text-base text-muted">
              @{profile.handle} · {profile.city}
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex md:pb-2">
            {primary}
            {hasMenu && (
              <Button
                variant="secondary"
                onClick={() => setMenu(true)}
                aria-label="More actions"
                className="w-12 px-0"
              >
                <MoreIcon className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-3 max-w-2xl text-lg text-body">
          {profile.bio || (isOwn ? "New on NokNok 👋" : `${profile.name.split(" ")[0]} is new on NokNok 👋`)}
        </p>
        {mutual.length > 0 && (
          <p className="mt-1 text-sm font-medium text-brand-700">
            {mutual.length} mutual friend{mutual.length === 1 ? "" : "s"}:{" "}
            {mutual.map((u) => u.name.split(" ")[0]).join(", ")}
          </p>
        )}

        <dl className="mt-5 grid grid-cols-4 divide-x divide-line rounded-[1.5rem] border border-line bg-surface/50 py-4">
          {statRows.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1 px-1 text-center md:grid md:grid-cols-[auto_auto] md:grid-rows-[auto_auto] md:justify-center md:gap-x-4 md:gap-y-0 md:text-left"
            >
              <dd className="order-1 text-2xl font-extrabold text-ink md:order-none md:col-start-2">
                {stat.value}
              </dd>
              <span className="order-2 md:order-none md:col-start-1 md:row-span-2 md:row-start-1 md:self-center" aria-hidden="true">
                {stat.icon}
              </span>
              <dt className="order-3 text-xs text-muted md:order-none md:col-start-2 md:text-sm">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex gap-2 md:hidden">
          {primary}
          {secondaryMobile}
        </div>
      </div>

      {hasMenu && (
        <Sheet open={menu} onClose={() => setMenu(false)} title={isOwn ? "Your account" : profile.name}>
          <div className="mt-2 flex flex-col gap-2">
            {isOwn ? (
              <Button variant="secondary" onClick={closeThen(onLogOut)}>
                <LogOutIcon className="h-4 w-4" />
                Log out
              </Button>
            ) : (
              <>
                <Button variant="secondary" loading={blocking} onClick={closeThen(onBlock)}>
                  {relationship.blocked ? "Unblock" : "Block"}
                </Button>
                <Button variant="secondary" onClick={closeThen(onReport)}>
                  Report
                </Button>
              </>
            )}
          </div>
        </Sheet>
      )}
    </header>
  );
}
