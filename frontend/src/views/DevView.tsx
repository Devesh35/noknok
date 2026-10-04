"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  advanceTime,
  endActivityNow,
  isPast,
  logIn,
  logOut,
  me,
  PAYMENT_MODE,
  resetDemo,
  updateDev,
  useDb,
} from "@/api";
import { Button } from "@/components/Button";
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

// /dev: hidden page for running demos. Not linked from the main navigation.
export function DevView() {
  const router = useRouter();
  const db = useDb();
  const [endId, setEndId] = useState("");

  if (!db) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const current = me(db);
  const upcoming = db.activities.filter((a) => a.status === "active" && !isPast(a)).sort(byStart);
  const activityOptions: SelectOption<string>[] = upcoming.map((a) => ({
    value: a.id,
    label: a.title,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Developer tools</h1>
        <p className="text-sm text-soft">
          Controls for demoing the prototype. Everything here only changes data on this device.
        </p>
      </div>

      <section className={CARD}>
        <h2 className={HEADING}>Switch user</h2>
        <p className="text-sm text-soft">
          Become any user to see the other side of a flow: host vs joiner, friend vs stranger.
          {current ? ` You are ${current.name}.` : " You are logged out."}
        </p>
        <div className="space-y-2">
          {db.users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              note={`+91 ${user.phone}`}
              action={
                user.id === db.meId ? (
                  <span className="shrink-0 rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-semibold text-brand-700">
                    Current
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => {
                      logIn(user.id);
                      toast(`You are now ${user.name}`);
                    }}
                  >
                    Switch
                  </Button>
                )
              }
            />
          ))}
        </div>
        {current && (
          <Button variant="ghost" onClick={logOut}>
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
          {db.dev.timeOffsetMs > 0 && ` (${Math.round(db.dev.timeOffsetMs / HOUR_MS)}h ahead)`}.
          Jump forward to trigger reminders, close refund windows, end activities and release
          payouts.
        </p>
        <div className="flex flex-wrap gap-2">
          {TIME_JUMPS.map((jump) => (
            <Button key={jump.label} variant="secondary" onClick={() => advanceTime(jump.ms)}>
              {jump.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            disabled={db.dev.timeOffsetMs === 0}
            onClick={() => updateDev({ timeOffsetMs: 0 })}
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
              onClick={() => {
                endActivityNow(endId);
                setEndId("");
                toast("Activity ended. Joiners can now rate the host.");
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
          checked={db.dev.autoAcceptFriends}
          onChange={(autoAcceptFriends) => updateDev({ autoAcceptFriends })}
        />
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Payments</h2>
        <p className="text-sm text-soft">
          Mode:{" "}
          <span className="font-mono font-semibold text-ink">
            {PAYMENT_MODE === "razorpay_test" ? "razorpay_test" : "fake"}
          </span>{" "}
          (set <span className="font-mono">NEXT_PUBLIC_PAYMENTS</span> in .env.local and restart).
        </p>
        <SelectMenu
          variant="field"
          label="Who pays the platform fee"
          value={db.dev.feeModel}
          onChange={(feeModel) => updateDev({ feeModel })}
          options={FEE_MODELS}
        />
        <SelectMenu
          variant="field"
          label="Fee size"
          value={String(db.dev.feePercent)}
          onChange={(value) => updateDev({ feePercent: Number(value) })}
          options={FEE_PERCENTS}
        />
        <Toggle
          label="Fail the next payment"
          hint="Fake mode only. Shows the failure and retry state once."
          checked={db.dev.failNextPayment}
          onChange={(failNextPayment) => updateDev({ failNextPayment })}
        />
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Reports ({db.reports.length})</h2>
        {db.reports.length === 0 ? (
          <p className="text-sm text-soft">
            Nothing reported. Reports made from a plan or profile land here; a real backend would
            send them to a moderation queue.
          </p>
        ) : (
          <ul className="space-y-2 text-sm text-body">
            {db.reports.map((item) => {
              const reporter = db.users.find((u) => u.id === item.reporterId)?.name ?? "Someone";
              const target =
                item.targetType === "user"
                  ? db.users.find((u) => u.id === item.targetId)?.name
                  : db.activities.find((a) => a.id === item.targetId)?.title;
              return (
                <li key={item.id}>
                  {reporter} reported {item.targetType === "user" ? "user" : "plan"}{" "}
                  <span className="font-semibold text-ink">{target ?? item.targetId}</span>:{" "}
                  {item.reason}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={CARD}>
        <h2 className={HEADING}>Reset</h2>
        <p className="text-sm text-soft">
          Restores the seeded users, activities and friendships, with dates relative to today, and
          logs you out.
        </p>
        <Button
          onClick={() => {
            resetDemo();
            toast("Demo data reset");
            router.push("/");
          }}
        >
          Reset demo data
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
