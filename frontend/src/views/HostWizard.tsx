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
import { Skeleton } from "@/components/Skeleton";
import { VISIBILITY_META } from "@/lib/activity";
import { breakdownForPrice } from "@/lib/fees";
import { formatInr } from "@/lib/format";
import { guessActivity } from "@/lib/guess";
import { toast } from "@/lib/toast";
import type { Activity, Category, DevSettings, User } from "@/lib/types";
import {
  blankForm,
  DRAFT_KEY,
  formFrom,
  LAST_STEP,
  loadDraft,
  STEP_BASICS,
  STEP_CATEGORY,
  STEP_PRICE,
  STEP_WHEN_WHERE,
  STEP_WHO,
  STEPS,
  toInput,
  validate,
  type Form,
} from "@/views/HostWizardSteps";
import {
  StepBasics,
  StepCategory,
  StepPrice,
  StepWhenWhere,
  StepWho,
} from "@/views/HostWizardStepViews";

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
  const [form, patch] = useReducer(
    (current: Form, change: Partial<Form>) => ({ ...current, ...change }),
    undefined,
    () =>
      editing ? formFrom(editing) : { ...blankForm(host.city), ...loadDraft() },
  );
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  // What the server rejected on publish; the steps' own checks catch the rest.
  const [publishError, setPublishError] = useState<string | null>(null);

  // Autosave new activities so a refresh or a detour doesn't lose the work.
  useEffect(() => {
    if (editing) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // Draft autosave is best effort.
    }
  }, [form, editing]);

  const minCapacity = editing ? editing.goingCount : 0;
  const errors = attempted ? validate(step, form, minCapacity) : {};

  const next = () => {
    if (Object.keys(validate(step, form, minCapacity)).length > 0) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    // Leaving Basics: suggest the category from the text unless the host has
    // already picked one themselves.
    if (step === STEP_BASICS && !form.categoryConfirmed) {
      const guess = guessActivity(form.title, form.description);
      if (guess) {
        patch({
          category: guess.category,
          subcategory: guess.subcategory,
          setting: guess.setting,
          coverUrl: guess.coverUrl,
        });
      }
    }
    setStep(step + 1);
    window.scrollTo({ top: 0 });
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
    } else {
      window.localStorage.removeItem(DRAFT_KEY);
      toast("Your activity is live 🎉");
    }
    router.replace(`/host/${result.data.id}`);
  };

  const discardDraft = () => {
    window.localStorage.removeItem(DRAFT_KEY);
    patch(blankForm(host.city));
    setStep(0);
    setAttempted(false);
    toast("Draft cleared");
  };

  // Leaves the wizard. A new plan's draft is dropped; an edit is just abandoned.
  const cancel = () => {
    if (!editing) window.localStorage.removeItem(DRAFT_KEY);
    router.push(editing ? `/host/${editing.id}` : "/host");
  };

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
    ? breakdownForPrice(preview.priceP, dev.feeModel, dev.feePercent)
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <p className="text-sm font-semibold text-brand-700">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        {editing ? "Edit activity" : "Host an activity"} · {STEPS[step]}
      </h1>
      <div
        role="progressbar"
        aria-label="Wizard progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-600 to-accent transition-[width] duration-500 ease-out-soft"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <div
        key={step}
        className="glass-card stagger mt-6 space-y-4 rounded-[2rem] p-4 md:p-6"
      >
        {step === STEP_BASICS && <StepBasics form={form} patch={patch} errors={errors} />}
        {step === STEP_CATEGORY && (
          <StepCategory form={form} patch={patch} errors={errors} />
        )}
        {step === STEP_WHEN_WHERE && (
          <StepWhenWhere form={form} patch={patch} errors={errors} />
        )}
        {step === STEP_PRICE && (
          <StepPrice form={form} patch={patch} errors={errors} dev={dev} />
        )}
        {step === STEP_WHO && <StepWho form={form} patch={patch} errors={errors} />}

        {preview && price && (
          <>
            <ActivityCard
              activity={preview}
              going={minCapacity}
              host={host}
              preview
            />
            <dl className="space-y-1 text-sm text-body">
              <div className="flex justify-between gap-4">
                <dt>Joiners pay</dt>
                <dd className="font-semibold">
                  {price.totalP === 0 ? "Free" : formatInr(price.totalP)}
                </dd>
              </div>
              {price.ticketP > 0 && (
                <div className="flex justify-between gap-4">
                  <dt>You receive per ticket</dt>
                  <dd className="font-semibold">
                    {formatInr(price.hostReceivesP)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt>Who can join</dt>
                <dd className="font-semibold">
                  {VISIBILITY_META[preview.visibility].label}
                </dd>
              </div>
            </dl>
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

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < LAST_STEP ? (
          <Button className="flex-1" onClick={next}>
            Next
          </Button>
        ) : (
          <Button className="flex-1" onClick={publish} loading={saving}>
            {editing ? "Save changes" : "Publish"}
          </Button>
        )}
      </div>
      {!editing && (
        <p className="mt-2 text-center text-xs text-muted">
          Your draft saves automatically.{" "}
          <button
            type="button"
            onClick={discardDraft}
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
