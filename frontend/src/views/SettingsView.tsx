"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  deleteAccount,
  isHandleAvailable,
  logOut,
  toggleBlock,
  updateProfile,
  updateSettings,
  useBlockedUsers,
  useMe,
  type ErrorCode,
  type Result,
} from "@/api";
import { Avatar } from "@/components/Avatar";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Input, Textarea, Toggle } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { UserRow, VerifiedBadges } from "@/components/UserBits";
import { CATEGORIES, CATEGORY_META } from "@/lib/activity";
import { isStandalone, promptInstall, useCanInstall } from "@/lib/device";
import { IS_PRODUCTION } from "@/lib/env";
import { toast } from "@/lib/toast";
import { CITIES, type Category, type City, type Me, type UserSettings } from "@/lib/types";

const CARD = "glass-card space-y-3 rounded-3xl p-4 md:p-5";
const HEADING = "text-lg font-bold text-ink";
const REMINDER_DEMO_MS = 10_000;
const HANDLE_CHECK_MS = 300;
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
const TRANSIENT = new Set<ErrorCode>(["NETWORK", "SERVER", "RATE_LIMITED"]);

// Settings controls have no inline failure state of their own: a failed save
// tells the user and the control snaps back on refetch.
function reportFailure(result: Result<unknown>): boolean {
  if (result.ok) return true;
  toast(TRANSIENT.has(result.code) ? result.message : "That couldn't be saved. Try again.");
  return false;
}

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
const PRIVACY_OPTIONS: SelectOption<UserSettings["joinedVisibility"]>[] = [
  { value: "everyone", label: "Everyone" },
  { value: "friends", label: "Only my friends" },
  { value: "nobody", label: "Nobody" },
];
// Bundled portraits a user can pick instead of initials.
const AVATAR_PRESETS = ["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"].map(
  (id) => `/images/avatars/${id}.jpg`,
);

// Asks the server whether a handle is free, a beat after typing stops. null
// while a check is in flight. The user's own handle is always theirs.
function useHandleAvailable(handle: string, own: string): boolean | null {
  const [checked, setChecked] = useState<{ handle: string; available: boolean } | null>(null);
  const needsCheck = handle !== own && HANDLE_PATTERN.test(handle);
  useEffect(() => {
    if (!needsCheck) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await isHandleAvailable(handle);
      if (!cancelled) setChecked({ handle, available });
    }, HANDLE_CHECK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, needsCheck]);
  if (!needsCheck) return true;
  return checked?.handle === handle ? checked.available : null;
}

function ProfileForm({ user }: { user: Me }) {
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState<City>(user.city);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [interests, setInterests] = useState<Category[]>(user.interests);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set when the server rejects the handle on save, in case the check missed it.
  const [takenHandle, setTakenHandle] = useState<string | null>(null);
  const available = useHandleAvailable(handle, user.handle);

  const errors = {
    name: name.trim() ? "" : "Enter your name",
    handle: !HANDLE_PATTERN.test(handle)
      ? "3-20 characters: lowercase letters, numbers or _"
      : available === false || handle === takenHandle
        ? `@${handle} is already taken`
        : "",
  };

  const toggleInterest = (category: Category) =>
    setInterests((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.handle || available === null) return;
    setSaving(true);
    const result = await updateProfile({
      name: name.trim(),
      handle,
      bio: bio.trim(),
      city,
      avatarUrl,
      interests,
    });
    setSaving(false);
    if (result.ok) toast("Profile saved");
    else if (result.code === "HANDLE_TAKEN") setTakenHandle(handle);
    else reportFailure(result);
  };

  return (
    <form onSubmit={save} noValidate className={CARD}>
      <h2 className={HEADING}>Profile</h2>
      <div>
        <p className="mb-1 text-sm font-medium text-body">Photo</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label="Use my initials"
            aria-pressed={!avatarUrl}
            onClick={() => setAvatarUrl(undefined)}
            className={`rounded-full p-0.5 transition ${!avatarUrl ? "ring-2 ring-brand-600" : "opacity-70"}`}
          >
            <Avatar user={{ name: name || user.name, handle: user.handle }} />
          </button>
          {AVATAR_PRESETS.map((url, index) => (
            <button
              key={url}
              type="button"
              aria-label={`Photo ${index + 1}`}
              aria-pressed={avatarUrl === url}
              onClick={() => setAvatarUrl(url)}
              className={`rounded-full p-0.5 transition ${
                avatarUrl === url ? "ring-2 ring-brand-600" : "opacity-70 hover:opacity-100"
              }`}
            >
              <Avatar user={{ name: "", handle: url, avatarUrl: url }} />
            </button>
          ))}
        </div>
      </div>
      <Input
        label="Name"
        value={name}
        autoComplete="name"
        onChange={(event) => setName(event.target.value)}
        error={submitted && errors.name ? errors.name : undefined}
      />
      <Input
        label="Handle"
        prefix="@"
        value={handle}
        autoCapitalize="none"
        maxLength={20}
        onChange={(event) => setHandle(event.target.value.toLowerCase().trim())}
        // Live once the handle differs from the saved one: format first, then
        // the debounced availability check.
        error={(submitted || handle !== user.handle) && errors.handle ? errors.handle : undefined}
      />
      {handle !== user.handle && !errors.handle && (
        <p className="-mt-2 text-xs text-muted" aria-live="polite">
          {available === null ? "Checking…" : `@${handle} is available`}
        </p>
      )}
      <Textarea label="Bio" value={bio} rows={3} maxLength={160} onChange={(e) => setBio(e.target.value)} />
      <SelectMenu variant="field" label="City" value={city} onChange={setCity} options={CITY_OPTIONS} />
      <div>
        <p className="mb-1 text-sm font-medium text-body">Interests</p>
        <p className="mb-2 text-xs text-muted">Used for the &quot;For you&quot; row on Home.</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              selected={interests.includes(category)}
              onClick={() => toggleInterest(category)}
            >
              <span aria-hidden="true">{CATEGORY_META[category].emoji}</span>
              {CATEGORY_META[category].label}
            </Chip>
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        Save profile
      </Button>
    </form>
  );
}

// Asks for notification permission, then proves the plumbing with one local
// notification. Real reminders need a push server.
async function enableReminders(): Promise<boolean> {
  if (!("Notification" in window)) {
    toast("This browser doesn't support notifications");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast("Notifications are blocked. Allow them in your browser settings.");
    return false;
  }
  toast("Reminders on. A test one arrives in 10 seconds.");
  setTimeout(() => {
    new Notification("NokNok reminder", {
      body: "This is what a reminder will look like before your next plan.",
    });
  }, REMINDER_DEMO_MS);
  return true;
}

// /settings: profile, notifications, privacy, account.
export function SettingsView() {
  const router = useRouter();
  const { me: user, loaded } = useMe();
  const blockedQuery = useBlockedUsers(Boolean(user));
  const canInstall = useCanInstall();
  const [sheet, setSheet] = useState<"delete" | "install" | null>(null);

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        page
        emoji="⚙️"
        title="Log in to change settings"
        action={
          <Link href="/login?next=/settings" className={buttonClass("primary")}>
            Log in
          </Link>
        }
      />
    );
  }

  const settings = user.settings;
  const blocked = blockedQuery.data?.items;

  const setSetting = async (patch: Partial<UserSettings>) => {
    reportFailure(await updateSettings(patch));
  };

  const unblock = async (person: { id: string; name: string }) => {
    if (reportFailure(await toggleBlock(person.id))) toast(`Unblocked ${person.name}`);
  };

  const install = async () => {
    if (isStandalone()) toast("NokNok is already installed");
    else if (canInstall) {
      if (await promptInstall()) toast("Installed. Find NokNok on your home screen.");
    } else setSheet("install");
  };

  return (
    <div className="stagger mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Settings</h1>
        <Link href="/u/me" className={buttonClass("ghost")}>
          Back to profile
        </Link>
      </div>

      <ProfileForm key={user.id} user={user} />

      <section className={CARD}>
        <h2 className={HEADING}>Verification</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-soft">
          <VerifiedBadges user={user} />
          {!user.idVerified && <span>ID not verified yet</span>}
        </div>
        <Button
          variant="secondary"
          disabled={user.idVerified}
          onClick={() => toast("ID verification arrives with the backend")}
        >
          {user.idVerified ? "ID verified" : "Verify my ID"}
        </Button>
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Notifications</h2>
        <Toggle
          label="Reminders on this device"
          hint="Asks for permission, then sends a test notification."
          checked={settings.push}
          onChange={async (checked) => {
            if (!checked) setSetting({ push: false });
            else if (await enableReminders()) setSetting({ push: true });
          }}
        />
        <Toggle
          label="WhatsApp"
          hint="Join confirmations and reminders."
          checked={settings.whatsapp}
          onChange={(whatsapp) => setSetting({ whatsapp })}
        />
        <Toggle label="SMS" checked={settings.sms} onChange={(sms) => setSetting({ sms })} />
        <Toggle
          label="Email"
          checked={settings.email}
          onChange={(email) => setSetting({ email })}
        />
        <p className="text-xs text-muted">
          WhatsApp, SMS and email are sent by a server, so in the prototype these only save your
          preference.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Privacy</h2>
        <SelectMenu
          variant="field"
          label="Who can see the activities I've joined"
          value={settings.joinedVisibility}
          onChange={(joinedVisibility) => setSetting({ joinedVisibility })}
          options={PRIVACY_OPTIONS}
        />
        <div>
          <p className="mb-2 text-sm font-medium text-body">Blocked users</p>
          {blocked === undefined ? (
            blockedQuery.isPending ? (
              <Skeleton className="h-16 w-full rounded-3xl" />
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                Couldn&apos;t load your blocked list.
                <Button variant="ghost" onClick={() => blockedQuery.refetch()}>
                  Try again
                </Button>
              </p>
            )
          ) : blocked.length === 0 ? (
            <p className="text-sm text-muted">
              Nobody. Block someone from their profile to hide their activities.
            </p>
          ) : (
            <div className="space-y-2">
              {blocked.map((person) => (
                <UserRow
                  key={person.id}
                  user={person}
                  action={
                    <Button variant="secondary" onClick={() => unblock(person)}>
                      Unblock
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>App</h2>
        <Button variant="secondary" className="w-full" onClick={install}>
          Add NokNok to my home screen
        </Button>
        {!IS_PRODUCTION && (
          <Link href="/dev" className={buttonClass("ghost", "w-full")}>
            Developer tools
          </Link>
        )}
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Account</h2>
        <p className="text-sm text-soft">Logged in as +91 {user.phone}</p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            if (reportFailure(await logOut())) router.push("/");
          }}
        >
          Log out
        </Button>
        <Button variant="ghost" className="w-full text-red-400" onClick={() => setSheet("delete")}>
          Delete account
        </Button>
      </section>

      <Sheet open={sheet === "delete"} onClose={() => setSheet(null)} title="Delete your account?">
        <p className="text-sm text-soft">
          This removes your account, your plans, your tickets and your friends. It can&apos;t be
          undone.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={async () => {
              if (!reportFailure(await deleteAccount())) return;
              toast("Account deleted");
              router.push("/");
            }}
          >
            Delete everything
          </Button>
          <Button variant="secondary" onClick={() => setSheet(null)}>
            Keep my account
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "install"} onClose={() => setSheet(null)} title="Add to home screen">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-soft">
          <li>
            On iPhone: tap the <span className="font-semibold">Share</span> button in Safari.
          </li>
          <li>
            Choose <span className="font-semibold">Add to Home Screen</span>.
          </li>
          <li>
            On Android or desktop Chrome: open the browser menu and choose{" "}
            <span className="font-semibold">Install app</span>.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          The one-tap install button appears on the deployed (HTTPS) site in Chrome.
        </p>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setSheet(null)}>
          Got it
        </Button>
      </Sheet>
    </div>
  );
}
