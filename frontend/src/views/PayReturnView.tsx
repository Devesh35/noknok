"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyPayment } from "@/api";
import { buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { merchantOrderIdFrom } from "@/lib/payments/phonepe";
import { toast } from "@/lib/toast";

const POLL_MS = 3000;
const GIVE_UP_MS = 2 * 60 * 1000;

type State =
  | { kind: "checking" }
  | { kind: "slow"; activityId: string } // still pending after two minutes
  | { kind: "failed" }
  | { kind: "login" }
  | { kind: "bad_link" };

// "Confirming your payment…": asks the server every few seconds until the
// gateway decides, then goes to the plan. The webhook and the job tick settle
// the join even if this page is closed; this page only makes it faster.
export function PayReturnView() {
  const router = useRouter();
  const params = useSearchParams();
  const merchantOrderId = merchantOrderIdFrom(params);
  const [state, setState] = useState<State>(merchantOrderId ? { kind: "checking" } : { kind: "bad_link" });

  useEffect(() => {
    if (!merchantOrderId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const check = async () => {
      const result = await verifyPayment({ merchantOrderId });
      if (stopped) return;
      if (result.ok && result.data.state === "captured") {
        toast("Payment received. You're going! 🎉");
        router.replace(`/party/${result.data.activityId}`);
        return;
      }
      if (result.ok) {
        if (Date.now() - started >= GIVE_UP_MS) {
          setState({ kind: "slow", activityId: result.data.activityId });
          return;
        }
      } else if (result.code === "NOT_LOGGED_IN") {
        setState({ kind: "login" });
        return;
      } else if (result.code === "NOT_FOUND") {
        // Not an order of this account (or no order at all).
        setState({ kind: "bad_link" });
        return;
      } else if (result.code !== "NETWORK" && result.code !== "SERVER" && result.code !== "RATE_LIMITED") {
        setState({ kind: "failed" });
        return;
      }
      // Pending, or a blip on the way: ask again.
      timer = setTimeout(check, POLL_MS);
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [merchantOrderId, router]);

  const here = `/pay/return?${params.toString()}`;

  switch (state.kind) {
    case "checking":
      return (
        <div role="status" aria-live="polite" className="flex flex-col items-center px-6 py-16 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          <h1 className="mt-5 text-lg font-bold text-ink">Confirming your payment…</h1>
          <p className="mt-1 max-w-sm text-sm text-soft">
            This usually takes a few seconds. Please don&apos;t pay again.
          </p>
        </div>
      );
    case "slow":
      return (
        <EmptyState
          emoji="⏳"
          title="Still confirming your payment"
          body="Your spot is held and we'll notify you as soon as the bank confirms. You don't need to pay again."
          action={
            <Link href={`/party/${state.activityId}`} className={buttonClass("primary")}>
              Back to the plan
            </Link>
          }
        />
      );
    case "failed":
      return (
        <EmptyState
          emoji="⚠️"
          title="The payment didn't go through"
          body="If money left your account it will be refunded automatically, usually within 5–7 working days."
          action={
            <Link href="/" className={buttonClass("primary")}>
              Find plans
            </Link>
          }
        />
      );
    case "login":
      return (
        <EmptyState
          emoji="🔐"
          title="Log in to finish"
          body="Log in with the same number you joined with and we'll confirm your payment."
          action={
            <Link href={`/login?next=${encodeURIComponent(here)}`} className={buttonClass("primary")}>
              Log in
            </Link>
          }
        />
      );
    case "bad_link":
      return (
        <EmptyState
          emoji="🔗"
          title="This link doesn't look right"
          body="If you just paid, your ticket will show up under Profile › Joined once the payment is confirmed."
          action={
            <Link href="/u/me" className={buttonClass("primary")}>
              Go to my profile
            </Link>
          }
        />
      );
  }
}
