"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useState } from "react";
import {
  createActivity,
  updateActivity,
  useActivity,
  useMe,
  useSession,
} from "@/api";
import { ActivityCard } from "@/components/ActivityCard";
import { Button, buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  MapPinIcon,
  PencilIcon,
  UsersIcon,
} from "@/components/icons";
import { Skeleton } from "@/components/Skeleton";
import { VISIBILITY_META } from "@/lib/activity";
import { breakdownFor } from "@/lib/fees";
import { formatDateTime, formatInr, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Activity, Category, DevSettings, User } from "@/lib/types";
import {
  blankForm,
  draftKeys,
  formFrom,
  LAST_STEP,
  loadDraft,
  loadDraftStep,
  STEP_DETAILS,
  STEP_TYPE,
  STEPS,
  toInput,
  validate,
  type Form,
} from "@/views/HostWizardSteps";
import { StepDetails, StepType } from "@/views/HostWizardStepViews";

// Thin bars across the top, one per step, filled up to the current one.
function Progress({ step }: { step: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Wizard progress"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={step + 1}
      className="flex flex-1 gap-1.5"
    >
      {STEPS.map((_, index) => (
        <span
          key={index}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
            index <= step
              ? "bg-linear-to-r from-brand-600 to-brand-500"
              : "bg-ink/10"
          }`}
        />
      ))}
    </div>
  );
}

// Celebratory bits behind the tick on the success screen.
function Confetti() {
  const pieces = [
    ["10%", "12%", "bg-warning", "rotate-12"],
    ["78%", "8%", "bg-accent", "-rotate-12"],
    ["88%", "40%", "bg-location", "rotate-45"],
    ["6%", "56%", "bg-brand-500", "-rotate-45"],
    ["24%", "78%", "bg-success", "rotate-12"],
    ["70%", "82%", "bg-warning", "-rotate-12"],
    ["50%", "4%", "bg-location", "rotate-6"],
    ["92%", "68%", "bg-brand-700", "rotate-45"],
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {pieces.map(([left, top, color, rotate], i) => (
        <span
          key={i}
          className={`absolute h-2.5 w-4 rounded-sm animate-float ${color} ${rotate}`}
          style={{ left, top, animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </div>
  );
}

function Success({
  activity,
  onAnother,
}: {
  activity: Activity;
  onAnother: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 text-center">
      <div className="relative mx-auto flex h-56 w-56 items-center justify-center">
        <Confetti />
        <span className="animate-pop flex h-28 w-28 items-center justify-center rounded-full bg-brand-600 shadow-2xl shadow-brand-600/50">
          <CheckIcon className="h-14 w-14 text-white" strokeWidth={3} />
        </span>
      </div>
      <div className="stagger">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          Activity created!
        </h1>
        <p className="mt-2 text-base text-soft">
          Your hangout is now live and people can start joining.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href={`/host/${activity.id}`}
            className={buttonClass("primary", "w-full")}
          >
            View activity
          </Link>
          <Button variant="secondary" className="w-full" onClick={onAnother}>
            Create another
          </Button>
        </div>
      </div>
    </div>
  );
}

function WizardForm({
  host,
  dev,
  editing,
}: {
  host: User;
  dev: DevSettings;
  editing: Activity | undefined;
}) {
  const router = useRouter();
  const draft = draftKeys(host.id);
  const [form, patch] = useReducer(
    (current: Form, change: Partial<Form>) => ({ ...current, ...change }),
    undefined,
    () =>
      editing
        ? formFrom(editing)
        : { ...blankForm(host.city), ...loadDraft(host.id) },
  );
  const [step, setStep] = useState(() =>
    editing
      ? 0
      : loadDraftStep(host.id, {
          ...blankForm(host.city),
          ...loadDraft(host.id),
        }),
  );
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  // What the server rejected on publish; the steps' own checks catch the rest.
  const [publishError, setPublishError] = useState<string | null>(null);
  const [created, setCreated] = useState<Activity | null>(null);

  // Autosave new activities so a refresh or a detour doesn't lose the work.
  useEffect(() => {
    if (editing || created) return;
    try {
      window.localStorage.setItem(draft.form, JSON.stringify(form));
      window.localStorage.setItem(draft.step, String(step));
    } catch {
      // Draft autosave is best effort.
    }
  }, [form, step, editing, created, draft.form, draft.step]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draft.form);
      window.localStorage.removeItem(draft.step);
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  };

  const minCapacity = editing ? editing.goingCount : 0;
  const errors = attempted ? validate(step, form, minCapacity) : {};

  const goTo = (next: number) => {
    setAttempted(false);
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    if (Object.keys(validate(step, form, minCapacity)).length > 0) {
      setAttempted(true);
      return;
    }
    goTo(step + 1);
  };

  const publish = async () => {
    const input = toInput(form);
    setSaving(true);
    setPublishError(null);
    const result = editing
      ? await updateActivity(editing.id, input)
      : await createActivity(input);
    setSaving(false);
    if (!result.ok) {
      if (result.code === "INVALID") setPublishError(result.message);
      else toast(result.message);
      return;
    }
    if (editing) {
      toast("Changes saved");
      router.replace(`/host/${result.data.id}`);
      return;
    }
    clearDraft();
    setCreated(result.data);
    window.scrollTo({ top: 0 });
  };

  const startOver = () => {
    clearDraft();
    patch(blankForm(host.city));
    setCreated(null);
    setPublishError(null);
    goTo(0);
  };

  // Leaves the wizard. A new plan's draft is dropped; an edit is just abandoned.
  const cancel = () => {
    if (!editing) clearDraft();
    router.push(editing ? `/host/${editing.id}` : "/host");
  };

  if (created) return <Success activity={created} onAnother={startOver} />;

  const preview: Activity | null =
    step === LAST_STEP
      ? {
          ...toInput(form),
          category: form.category as Category,
          id: editing?.id ?? "preview",
          hostId: host.id,
          status: "active",
          shortCode: "",
          quick: false,
          goingCount: minCapacity,
          waitlistCount: 0,
          interestedCount: 0,
          createdAt: "",
        }
      : null;
  // Mirrors the server's fee rule for instant feedback; the server's answer wins.
  const price = preview
    ? breakdownFor(preview, dev.feeModel, dev.feePercent)
    : null;
  const summaryRow = "flex items-center gap-3 py-2.5 text-sm";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:py-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={step === 0 ? cancel : () => goTo(step - 1)}
          aria-label={step === 0 ? "Cancel" : "Back"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-soft transition hover:bg-surface-hi hover:text-ink"
        >
          {step === 0 ? (
            <CloseIcon className="h-6 w-6" />
          ) : (
            <ArrowLeftIcon className="h-6 w-6" />
          )}
        </button>
        <Progress step={step} />
        <span className="w-11 shrink-0" />
      </div>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
        {editing && step === STEP_TYPE
          ? "Edit activity"
          : editing && step === LAST_STEP
            ? "Review your changes"
            : STEPS[step].title}
      </h1>
      <p className="mt-1 text-base text-soft">{STEPS[step].blurb}</p>

      <div key={step} className="stagger mt-5 space-y-5">
        {step === STEP_TYPE && (
          <StepType form={form} patch={patch} errors={errors} />
        )}
        {step === STEP_DETAILS && (
          <StepDetails form={form} patch={patch} errors={errors} />
        )}

        {preview && price && (
          <>
            <div className="relative">
              <ActivityCard
                activity={preview}
                going={minCapacity}
                host={host}
                preview
              />
              <button
                type="button"
                onClick={() => goTo(STEP_DETAILS)}
                className="glass absolute top-3 right-3 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-ink"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
            <div className="glass-card rounded-3xl px-4">
              <div className="divide-y divide-line">
                <p className={summaryRow}>
                  <ClockIcon className="h-5 w-5 shrink-0 text-accent" />
                  <span className="text-body">
                    {formatDateTime(preview.startsAt)} –{" "}
                    {formatTime(preview.endsAt)}
                  </span>
                </p>
                <p className={summaryRow}>
                  <MapPinIcon className="h-5 w-5 shrink-0 text-location" />
                  <span className="text-body">
                    {preview.venueName} · {preview.city}
                  </span>
                </p>
                <p className={summaryRow}>
                  <UsersIcon className="h-5 w-5 shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">
                      Who can join
                    </span>
                    <span className="block text-body">
                      {VISIBILITY_META[preview.visibility].label}
                    </span>
                  </span>
                </p>
                <p className={summaryRow}>
                  <span
                    className="w-5 shrink-0 text-center text-base"
                    aria-hidden="true"
                  >
                    ₹
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted">
                      Joiners pay
                    </span>
                    <span className="block text-body">
                      {price.totalP === 0 ? "Free" : formatInr(price.totalP)}
                      {price.ticketP > 0 && (
                        <span className="text-muted">
                          {" "}
                          · you receive {formatInr(price.hostReceivesP)} per
                          ticket
                        </span>
                      )}
                      {" · "}
                      {preview.capacity} spots
                    </span>
                  </span>
                </p>
              </div>
            </div>
            {publishError && (
              <p
                role="alert"
                className="animate-rise rounded-2xl bg-red-500/10 p-3 text-sm text-red-300"
              >
                {publishError}
              </p>
            )}
          </>
        )}
      </div>

      {/* Sticky on phones so the action stays reachable on tall steps; the tab
          bar is hidden on this route (AppShell). */}
      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mt-5 rounded-[1.75rem] max-md:glass max-md:p-2 md:static">
        {step < LAST_STEP ? (
          <Button className="w-full" onClick={next}>
            Next
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="w-full" onClick={publish} loading={saving}>
            {editing ? "Save changes" : "Create activity"}
          </Button>
        )}
      </div>
      {!editing && step === 0 && (
        <p className="mt-3 text-center text-xs text-muted">
          Your draft saves automatically.{" "}
          <button
            type="button"
            onClick={startOver}
            className="min-h-11 font-semibold text-brand-700 hover:underline"
          >
            Start over
          </button>
        </p>
      )}
    </div>
  );
}

function WizardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-96 w-full rounded-[2rem]" />
    </div>
  );
}

function NothingToEdit() {
  return (
    <EmptyState
      page
      emoji="🕵️"
      title="Nothing to edit here"
      body="This activity doesn't exist, was cancelled, or isn't yours."
      action={
        <Link href="/host" className={buttonClass("primary")}>
          Your hosting
        </Link>
      }
    />
  );
}

// /host/new and /host/:id/edit.
export function HostWizard({ activityId }: { activityId?: string }) {
  const { me: host, loaded } = useMe();
  const { data: session } = useSession();
  const { data: detail, error, refetch } = useActivity(activityId ?? null);

  if (!loaded || session === undefined) return <WizardSkeleton />;
  if (!host) {
    const next = activityId ? `/host/${activityId}/edit` : "/host/new";
    return (
      <EmptyState
        page
        emoji="📣"
        title="Log in to host"
        body="You need an account so people know who's hosting."
        action={
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={buttonClass("primary")}
          >
            Log in
          </Link>
        }
      />
    );
  }

  let editing: Activity | undefined;
  if (activityId) {
    if (error) {
      if (
        error.code === "NOT_FOUND" ||
        error.code === "FORBIDDEN" ||
        error.code === "NOT_VISIBLE"
      ) {
        return <NothingToEdit />;
      }
      return (
        <EmptyState
          page
          emoji="📡"
          title="Couldn't load this activity"
          body={error.message}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      );
    }
    if (detail === undefined) return <WizardSkeleton />;
    editing = detail.activity;
    if (editing.hostId !== host.id || editing.status !== "active")
      return <NothingToEdit />;
  }

  return (
    <WizardForm
      key={activityId ?? "new"}
      host={host}
      dev={session.dev}
      editing={editing}
    />
  );
}
