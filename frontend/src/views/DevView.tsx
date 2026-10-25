"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  advanceTime,
  devLogIn,
  endActivityNow,
  logOut,
  resetDemo,
  seedTestEvents,
  updateDev,
  useDev,
  useSession,
  type Result,
} from "@/api";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Toggle } from "@/components/Field";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Skeleton } from "@/components/Skeleton";
import { UserRow } from "@/components/UserBits";
import { byStart } from "@/lib/activity";
import { formatDateTime } from "@/lib/format";
import { DAY_MS, HOUR_MS, now } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { FeeModel } from "@/lib/types";

const CARD = "glass-card space-y-3 rounded-3xl p-4 md:p-5";
const HEADING = "text-lg font-bold text-ink";

const FEE_MODELS: SelectOption<FeeModel>[] = [
  { value: "joiner", label: "Joiner pays the fee on top of the ticket" },
  { value: "host", label: "Host pays the fee out of the ticket" },
];
const FEE_PERCENTS: SelectOption<string>[] = ["0", "2", "5", "8", "10"].map((value) => ({
  value,
  label: `${value}% platform fee`,
}));
const TIME_JUMPS = [
  { label: "+1 hour", ms: HOUR_MS },
  { label: "+1 day", ms: DAY_MS },
  { label: "+3 days", ms: 3 * DAY_MS },
];

// Runs a dev action; a failure is only ever worth a toast here.
async function run<T>(action: Promise<Result<T>>, success?: string) {
  const result = await action;
  if (!result.ok) toast(result.message);
  else if (success) toast(success);
  return result.ok;
}

// /dev: hidden page for running demos. Not linked from the main navigation.
export function DevView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data, error, refetch } = useDev();
  const [endId, setEndId] = useState("");

  if (error) {
    return (
      <EmptyState
        page
        emoji="🛠️"
        title="Developer tools aren't available"
        body={error.message}
        action={<Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }
  if (!data || !session) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const current = session.user;
  const { dev } = data;
  const upcoming = [...data.upcoming].sort(byStart);
  const activityOptions: SelectOption<string>[] = upcoming.map((a) => ({
    value: a.id,
    label: a.title,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Developer tools</h1>
        <p className="text-sm text-soft">
          Controls for demoing the prototype. Everything here changes the shared database.
        </p>
      </div>

      <section className={CARD}>
        <h2 className={HEADING}>Switch user</h2>
        <p className="text-sm text-soft">
          Become any user to see the other side of a flow: host vs joiner, friend vs stranger.
          {current ? ` You are ${current.name}.` : " You are logged out."}
        </p>
        <div className="space-y-2">
          {data.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              note={`+91 ${user.phone}`}
              action={
                user.id === current?.id ? (
                  <span className="shrink-0 rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-semibold text-brand-700">
                    Current
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => run(devLogIn(user.id), `You are now ${user.name}`)}
                  >
                    Switch
                  </Button>
                )
              }
            />
          ))}
        </div>
        {current && (
          <Button variant="ghost" onClick={() => run(logOut())}>
            Log out
          </Button>
        )}
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Time travel</h2>
        <p className="text-sm text-soft">
          App time is{" "}
          <span className="font-semibold text-ink">
            {formatDateTime(new Date(now()).toISOString())}
          </span>
          {dev.timeOffsetMs > 0 && ` (${Math.round(dev.timeOffsetMs / HOUR_MS)}h ahead)`}.
          Jump forward to trigger reminders, close refund windows, end activities and release
          payouts.
        </p>
        <div className="flex flex-wrap gap-2">
          {TIME_JUMPS.map((jump) => (
            <Button key={jump.label} variant="secondary" onClick={() => run(advanceTime(jump.ms))}>
              {jump.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            disabled={dev.timeOffsetMs === 0}
            onClick={() => run(updateDev({ timeOffsetMs: 0 }))}
          >
            Back to real time
          </Button>
        </div>
        {activityOptions.length > 0 && (
          <div className="flex items-end gap-2">
            <SelectMenu
              variant="field"
              label="End one activity now"
              placeholder="Pick an activity"
              value={endId}
              onChange={setEndId}
              options={activityOptions}
              className="min-w-0 flex-1"
            />
            <Button
              disabled={!endId}
              onClick={async () => {
                const ok = await run(
                  endActivityNow(endId),
                  "Activity ended. Joiners can now rate the host.",
                );
                if (ok) setEndId("");
              }}
            >
              End
            </Button>
          </div>
        )}
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Friends</h2>
        <Toggle
          label="Auto-accept friend requests"
          hint="Adding a friend connects you instantly, without the other person accepting."
          checked={dev.autoAcceptFriends}
          onChange={(autoAcceptFriends) => run(updateDev({ autoAcceptFriends }))}
        />
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Payments</h2>
        <p className="text-sm text-soft">
          Mode:{" "}
          <span className="font-mono font-semibold text-ink">
            {session.paymentProvider} · {session.paymentEnv}
          </span>{" "}
          (set <span className="font-mono">PAYMENT_PROVIDER</span> and{" "}
          <span className="font-mono">PAYMENT_ENV</span> in .env.local and restart).
        </p>
        <SelectMenu
          variant="field"
          label="Who pays the platform fee"
          value={dev.feeModel}
          onChange={(feeModel) => run(updateDev({ feeModel }))}
          options={FEE_MODELS}
        />
        <SelectMenu
          variant="field"
          label="Fee size"
          value={String(dev.feePercent)}
          onChange={(value) => run(updateDev({ feePercent: Number(value) }))}
          options={FEE_PERCENTS}
        />
        <Toggle
          label="Fail the next payment"
          hint="Fake mode only. Shows the failure and retry state once."
          checked={dev.failNextPayment}
          onChange={(failNextPayment) => run(updateDev({ failNextPayment }))}
        />
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Test events</h2>
        <p className="text-sm text-soft">
          Adds three test hosts and sixteen upcoming events across all cities: free and paid, open and
          friends-only, empty and nearly full. Running it again only adds what is missing.
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            const result = await seedTestEvents();
            if (!result.ok) toast(result.message);
            else toast(result.data.events > 0 ? `Added ${result.data.events} events` : "Already added");
          }}
        >
          Add test events
        </Button>
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Reset</h2>
        <p className="text-sm text-soft">
          Deletes every user, activity, join and notification in the database and logs you out.
        </p>
        <Button
          onClick={async () => {
            if (await run(resetDemo(), "All data deleted")) router.push("/");
          }}
        >
          Delete all data
        </Button>
      </section>

      <p className="text-center text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand-700 hover:underline">
          Back to the app
        </Link>
      </p>
    </div>
  );
}
