"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  deleteAccount,
  isHandleAvailable,
  logOut,
  toggleBlock,
  updateProfile,
  updateSettings,
  uploadImage,
  useBlockedUsers,
  useMe,
  type ErrorCode,
  type Result,
} from "@/api";
import { Avatar } from "@/components/Avatar";
import { Button, buttonClass } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Input, Textarea } from "@/components/Field";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  LogOutIcon,
  PhoneIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Sheet } from "@/components/Sheet";
import { Skeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import { CATEGORIES, CATEGORY_META } from "@/lib/activity";
import { toast } from "@/lib/toast";
import {
  CITIES,
  type Category,
  type City,
  type Me,
  type UserSettings,
} from "@/lib/types";

const HANDLE_CHECK_MS = 300;
const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
const BIO_MAX = 160;
const TRANSIENT = new Set<ErrorCode>(["NETWORK", "SERVER", "RATE_LIMITED"]);

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "verification", label: "Verification", icon: ShieldIcon },
  { id: "privacy", label: "Privacy", icon: LockIcon },
  { id: "account", label: "Account", icon: SettingsIcon },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const CARD = "glass-card scroll-mt-24 rounded-[1.75rem] p-5 md:p-6";
const ROWS =
  "divide-y divide-line rounded-2xl border border-line bg-canvas-2/60";
const ROW = "flex flex-wrap items-center gap-3 px-4 py-3";

// Settings controls have no inline failure state of their own: a failed save
// tells the user and the control snaps back on refetch.
function reportFailure(result: Result<unknown>): boolean {
  if (result.ok) return true;
  toast(
    TRANSIENT.has(result.code)
      ? result.message
      : "That couldn't be saved. Try again.",
  );
  return false;
}

const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({
  value: city,
  label: city,
}));
const PRIVACY_OPTIONS: SelectOption<UserSettings["joinedVisibility"]>[] = [
  { value: "everyone", label: "Everyone" },
  { value: "friends", label: "Only my friends" },
  { value: "nobody", label: "Nobody" },
];

// Asks the server whether a handle is free, a beat after typing stops. null
// while a check is in flight. The user's own handle is always theirs.
function useHandleAvailable(handle: string, own: string): boolean | null {
  const [checked, setChecked] = useState<{
    handle: string;
    available: boolean;
  } | null>(null);
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

// Which section is in view, for the side nav.
function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>("profile");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (hit) setActive(hit.target.id as SectionId);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

// Icon tile, title and one line of help at the top of a section card.
function SectionHead({
  icon,
  title,
  blurb,
  action,
}: {
  icon: ReactNode;
  title: string;
  blurb: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600/15 text-brand-700">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        <p className="text-sm text-soft">{blurb}</p>
      </div>
      {action}
    </div>
  );
}

// Soft blobs behind the profile card's title.
function ProfileCover() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-28 overflow-hidden rounded-t-[1.75rem] bg-linear-to-r from-brand-600 via-[#6d5cff] to-accent"
    >
      <span className="absolute -top-16 right-[18%] h-48 w-48 rounded-full bg-linear-to-br from-sky-300/80 to-accent/40 blur-sm" />
      <span className="absolute top-6 right-[38%] h-24 w-24 rounded-full bg-linear-to-br from-violet-300/70 to-brand-500/30 blur-[2px]" />
      <span className="absolute -right-10 -bottom-16 h-44 w-44 rounded-full bg-linear-to-br from-fuchsia-300/60 to-brand-500/20 blur-[2px]" />
      <span className="absolute inset-0 bg-linear-to-t from-surface via-transparent to-transparent" />
    </div>
  );
}

function ProfileForm({ user }: { user: Me }) {
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState<City | "">(user.city ?? "");
  // The photo saves on its own the moment it's picked or removed, so it isn't
  // part of the form's dirty state; `user.avatarUrl` is always current.
  const avatarUrl = user.avatarUrl;
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [interests, setInterests] = useState<Category[]>(user.interests);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set when the server rejects the handle on save, in case the check missed it.
  const [takenHandle, setTakenHandle] = useState<string | null>(null);
  const available = useHandleAvailable(handle, user.handle);

  const errors = {
    name: name.trim() ? "" : "Enter your name",
    // The saved handle is always acceptable, even one from before the
    // current rules; the rules apply when it changes.
    handle:
      handle === user.handle
        ? ""
        : !HANDLE_PATTERN.test(handle)
          ? "3-20 characters: lowercase letters, numbers or _"
          : available === false || handle === takenHandle
            ? `@${handle} is already taken`
            : "",
  };
  const dirty =
    name !== user.name ||
    handle !== user.handle ||
    bio !== user.bio ||
    city !== (user.city ?? "") ||
    interests.join() !== user.interests.join();

  const toggleInterest = (category: Category) =>
    setInterests((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    );

  const reset = () => {
    setName(user.name);
    setHandle(user.handle);
    setBio(user.bio);
    setCity(user.city ?? "");
    setInterests(user.interests);
    setSubmitted(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.handle || available === null) return;
    setSaving(true);
    const result = await updateProfile({
      name: name.trim(),
      ...(handle !== user.handle ? { handle } : {}),
      bio: bio.trim(),
      ...(city ? { city } : {}),
      interests,
    });
    setSaving(false);
    if (result.ok) toast("Profile saved");
    else if (result.code === "HANDLE_TAKEN") setTakenHandle(handle);
    else reportFailure(result);
  };

  const preview = { name: name || user.name, handle: user.handle, avatarUrl };

  const savePhoto = async (url: string | null) => {
    // Sending null clears the photo; leaving it out would keep the old one.
    if (reportFailure(await updateProfile({ avatarUrl: url })))
      toast(url ? "Photo saved" : "Photo removed");
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const result = await uploadImage(file);
    if (result.ok) await savePhoto(result.data.url);
    else toast(result.message);
    setUploading(false);
  };

  return (
    <form
      onSubmit={save}
      noValidate
      id="profile"
      className={`${CARD} relative overflow-hidden`}
    >
      <ProfileCover />
      <div className="relative">
        <h2 className="text-lg font-extrabold text-white">Profile</h2>
        <p className="text-sm text-violet-100/90">
          This information will be visible to others on NokNok.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            aria-label="Upload a photo"
            className="relative rounded-full transition active:scale-95 disabled:opacity-60"
          >
            <Avatar
              user={preview}
              size="xl"
              className="h-24 w-24 text-3xl shadow-xl ring-4 ring-surface"
            />
            <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-surface">
              <CameraIcon className="h-4 w-4" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Profile photo</p>
            <p className="mb-3 text-xs text-muted">
              A clear photo of you helps people recognise you at the venue. JPG
              or PNG, up to 3 MB.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <UploadIcon className="h-4 w-4" />
                {avatarUrl ? "Change photo" : "Upload a photo"}
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={uploading}
                  onClick={() => savePhoto(null)}
                >
                  Remove photo
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-x-5 gap-y-4 md:grid-cols-2">
          <Input
            label="Name"
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            error={submitted && errors.name ? errors.name : undefined}
          />
          <div className="relative">
            <Input
              label="Handle"
              prefix="@"
              value={handle}
              autoCapitalize="none"
              maxLength={20}
              onChange={(event) =>
                setHandle(event.target.value.toLowerCase().trim())
              }
              className="pr-10"
              // Live once the handle differs from the saved one: format first,
              // then the debounced availability check.
              error={
                (submitted || handle !== user.handle) && errors.handle
                  ? errors.handle
                  : undefined
              }
            />
            {!errors.handle && available === true && (
              <span
                className="pointer-events-none absolute top-[2.45rem] right-3 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"
                aria-hidden="true"
              >
                <CheckIcon className="h-3 w-3" />
              </span>
            )}
            {handle !== user.handle && !errors.handle && (
              <p className="mt-1 text-xs text-muted" aria-live="polite">
                {available === null ? "Checking…" : `@${handle} is available`}
              </p>
            )}
          </div>
          <div>
            <Textarea
              label="Bio"
              value={bio}
              rows={3}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted">
              {bio.length}/{BIO_MAX}
            </p>
          </div>
          <SelectMenu
            variant="field"
            label="City"
            icon="📍"
            value={city}
            onChange={setCity}
            options={CITY_OPTIONS}
            placeholder="Select your city"
          />
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Interests</p>
          <p className="mb-2 text-xs text-muted">
            Used for the &quot;For you&quot; row on Home.
          </p>
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

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={reset}
            disabled={!dirty || saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save profile
          </Button>
        </div>
      </div>
    </form>
  );
}

// /settings: profile, verification, privacy, account.
export function SettingsView() {
  const router = useRouter();
  const { me: user, loaded } = useMe();
  const blockedQuery = useBlockedUsers(Boolean(user));
  const [sheet, setSheet] = useState<"delete" | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  const active = useActiveSection();

  if (!loaded) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/3" />
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
    if (reportFailure(await toggleBlock(person.id)))
      toast(`Unblocked ${person.name}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Settings
          </h1>
          <p className="mt-1 text-base text-soft">
            Manage your profile, privacy and account settings.
          </p>
        </div>
        <Link href="/u/me" className={buttonClass("ghost")}>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to profile
        </Link>
      </div>

      <div className="mt-6 gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        {/* Section nav: a row of chips on phones, a sticky list on desktop. */}
        <nav
          aria-label="Settings sections"
          className="mb-5 lg:sticky lg:top-24 lg:mb-0"
        >
          <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:glass-card lg:mx-0 lg:flex-col lg:rounded-[1.75rem] lg:p-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const current = active === id;
              return (
                <li key={id} className="shrink-0">
                  <a
                    href={`#${id}`}
                    aria-current={current ? "location" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition duration-200 ${
                      current
                        ? "bg-brand-600/15 text-ink shadow-[inset_0_0_0_1px_rgb(127_79_240/0.35)]"
                        : "text-soft hover:bg-surface-hi/70 hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${current ? "text-brand-700" : "text-muted"}`}
                    />
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="stagger space-y-5">
          <ProfileForm key={user.id} user={user} />

          <section
            id="verification"
            aria-labelledby="verification-heading"
            className={CARD}
          >
            <SectionHead
              icon={<ShieldIcon className="h-6 w-6" />}
              title="Verification"
              blurb="Verify your account to build trust and access more features."
            />
            <div className={ROWS}>
              <div className={ROW}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
                  <PhoneIcon className="h-4 w-4" />
                </span>
                <span className="font-semibold text-ink">Phone</span>
                <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                  Verified
                </span>
                <span className="ml-auto" />
              </div>
              <div className={ROW}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600/15 text-brand-700">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <span className="font-semibold text-ink">ID</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    user.idVerified
                      ? "bg-success/15 text-success"
                      : "bg-surface-hi text-soft"
                  }`}
                >
                  {user.idVerified ? "Verified" : "Not verified yet"}
                </span>
                <Button
                  variant="secondary"
                  className="ml-auto"
                  disabled={user.idVerified}
                  onClick={() =>
                    toast("ID verification arrives with the backend")
                  }
                >
                  {user.idVerified ? "ID verified" : "Verify my ID"}
                </Button>
              </div>
            </div>
          </section>

          <section
            id="privacy"
            aria-labelledby="privacy-heading"
            className={CARD}
          >
            <SectionHead
              icon={<LockIcon className="h-6 w-6" />}
              title="Privacy"
              blurb="Control who can see your activities and connect with you."
            />
            <div className={ROWS}>
              <div className={ROW}>
                <UsersIcon className="h-5 w-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                  Who can see the activities I&apos;ve joined
                </span>
                <SelectMenu
                  label="Who can see the activities I've joined"
                  value={settings.joinedVisibility}
                  onChange={(joinedVisibility) =>
                    setSetting({ joinedVisibility })
                  }
                  options={PRIVACY_OPTIONS}
                  align="end"
                  className="font-semibold max-md:w-full"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowBlocked((open) => !open)}
                  aria-expanded={showBlocked}
                  className={`${ROW} w-full text-left`}
                >
                  <LockIcon className="h-5 w-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">
                      Blocked users
                      {blocked && blocked.length > 0
                        ? ` (${blocked.length})`
                        : ""}
                    </span>
                    <span className="block text-xs text-muted">
                      Block someone from their profile to hide their activities.
                    </span>
                  </span>
                  <ChevronDownIcon
                    className={`h-5 w-5 text-muted transition duration-300 ${showBlocked ? "rotate-180" : ""}`}
                  />
                </button>
                {showBlocked && (
                  <div className="px-4 pb-4">
                    {blocked === undefined ? (
                      blockedQuery.isPending ? (
                        <Skeleton className="h-16 w-full rounded-3xl" />
                      ) : (
                        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                          Couldn&apos;t load your blocked list.
                          <Button
                            variant="ghost"
                            onClick={() => blockedQuery.refetch()}
                          >
                            Try again
                          </Button>
                        </p>
                      )
                    ) : blocked.length === 0 ? (
                      <p className="text-sm text-muted">Nobody is blocked.</p>
                    ) : (
                      <div className="space-y-2">
                        {blocked.map((person) => (
                          <UserRow
                            key={person.id}
                            user={person}
                            action={
                              <Button
                                variant="secondary"
                                onClick={() => unblock(person)}
                              >
                                Unblock
                              </Button>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section
            id="account"
            aria-labelledby="account-heading"
            className={CARD}
          >
            <SectionHead
              icon={<SettingsIcon className="h-6 w-6" />}
              title="Account"
              blurb={`Logged in as +91 ${user.phone}.`}
            />
            <div className={ROWS}>
              <div className={ROW}>
                <LogOutIcon className="h-5 w-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    Log out
                  </span>
                  <span className="block text-xs text-muted">
                    Sign out on this device.
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (reportFailure(await logOut())) router.push("/");
                  }}
                >
                  Log out
                </Button>
              </div>
              <div className={ROW}>
                <span
                  className="h-5 w-5 shrink-0 text-center text-red-400"
                  aria-hidden="true"
                >
                  !
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    Delete account
                  </span>
                  <span className="block text-xs text-muted">
                    Removes your plans, tickets and friends. Can&apos;t be
                    undone.
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="text-red-400"
                  onClick={() => setSheet("delete")}
                >
                  Delete
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Sheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        title="Delete your account?"
      >
        <p className="text-sm text-soft">
          This removes your account, your plans, your tickets and your friends.
          It can&apos;t be undone.
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
    </div>
  );
}
