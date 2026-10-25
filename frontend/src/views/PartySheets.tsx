"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/Button";
import { ReportSheet } from "@/components/ReportSheet";
import { ShareSheet } from "@/components/ShareSheet";
import { Sheet } from "@/components/Sheet";
import { PriceRows, TicketCard } from "@/components/Ticket";
import { formatInr, refundWindow } from "@/lib/format";
import type {
  Activity,
  FeeModel,
  Join,
  PriceBreakdown,
  User,
} from "@/lib/types";

export type SheetName =
  "login" | "login-interest" | "checkout" | "success" | "ticket" | "leave" | "share" | "report";
export type PaymentState = "idle" | "processing" | "failed";

interface PartySheetsProps {
  sheet: SheetName | null;
  onClose: () => void;
  activity: Activity;
  viewer: User | null;
  myJoin: Join | null;
  price: PriceBreakdown;
  feeModel: FeeModel;
  refundable: boolean;
  payment: PaymentState;
  onPay: () => void;
  onLeave: () => void;
  leaving: boolean;
  onSharePlan: () => void;
  shareUrl: string;
  shortUrl: string;
  isInvite: boolean;
}

// Every bottom sheet the activity page opens. One is shown at a time.
export function PartySheets({
  sheet,
  onClose,
  activity,
  viewer,
  myJoin,
  price,
  feeModel,
  refundable,
  payment,
  onPay,
  onLeave,
  leaving,
  onSharePlan,
  shareUrl,
  shortUrl,
  isInvite,
}: PartySheetsProps) {
  const paidP = myJoin ? myJoin.ticketP + myJoin.feeP : 0;
  const full = activity.goingCount >= activity.capacity;
  const forInterest = sheet === "login-interest";
  const nextInLine =
    activity.waitlistCount > 0
      ? " Your spot goes to the next person on the waitlist."
      : "";

  return (
    <>
      <Sheet
        open={sheet === "login" || forInterest}
        onClose={onClose}
        title={
          forInterest
            ? "Log in to save this plan"
            : full
              ? "Log in to join the waitlist"
              : "Log in to join"
        }
      >
        <p className="text-sm text-soft">
          {forInterest
            ? "You need an account to mark "
            : full
              ? "You need an account to join the waitlist for "
              : "You need an account to join "}
          <span className="font-semibold">{activity.title}</span>
          {forInterest ? " as interested" : ""}. It takes less than a minute.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(`/party/${activity.id}`)}`}
            className={buttonClass("primary")}
          >
            Continue with phone number
          </Link>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "checkout"}
        onClose={onClose}
        title="Confirm and pay"
      >
        <p className="text-sm text-soft">{activity.title}</p>
        <div className="mt-3">
          <PriceRows price={price} feeModel={feeModel} />
        </div>
        {payment === "failed" && (
          <p
            role="alert"
            className="mt-3 animate-rise rounded-2xl bg-red-500/10 p-3 text-sm text-red-300"
          >
            <span className="font-bold">Payment failed.</span> No money was
            taken. Try again, or use a different payment method.
          </p>
        )}
        {refundable ? (
          <p className="mt-3 text-sm text-muted">
            Full refund if you leave{" "}
            {refundWindow(activity.refundCutoffHours)}.
          </p>
        ) : (
          <p className="mt-3 rounded-2xl border border-warning/25 bg-warning/15 p-3 text-sm font-semibold text-warning">
            This is inside the no-refund window: leaving later won&apos;t refund
            you.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onPay} loading={payment === "processing"}>
            {payment === "processing"
              ? "Processing…"
              : payment === "failed"
                ? `Retry · ${formatInr(price.totalP)}`
                : `Pay ${formatInr(price.totalP)}`}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          NokNok holds the money and pays the host after the activity.
        </p>
      </Sheet>

      <Sheet open={sheet === "success"} onClose={onClose} title="You're in!">
        {sheet === "success" && (
          <p
            className="animate-pop py-1 text-center text-5xl"
            aria-hidden="true"
          >
            🎉
          </p>
        )}
        {myJoin && viewer && (
          <div className="mt-2">
            <TicketCard join={myJoin} activity={activity} holder={viewer} />
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/u/me" className={buttonClass("primary")}>
            View in my profile
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "ticket"} onClose={onClose} title="Your ticket">
        {myJoin && viewer && (
          <TicketCard join={myJoin} activity={activity} holder={viewer} />
        )}
        <p className="mt-3 text-center text-xs text-muted">
          Show this to the host at the door.
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={onSharePlan}
        >
          Share my plan with a friend
        </Button>
        <p className="mt-2 text-center text-xs text-muted">
          Sends where you&apos;ll be and when, so someone knows.
        </p>
      </Sheet>

      <Sheet
        open={sheet === "leave"}
        onClose={onClose}
        title="Leave this activity?"
      >
        <p className="text-sm text-soft">
          {paidP === 0
            ? `You can join again later if there's still room.${nextInLine}`
            : refundable
              ? `You'll get ${formatInr(paidP)} back.${nextInLine}`
              : `The free-cancellation window closed ${activity.refundCutoffHours} hours before the start, so there is no refund for your ${formatInr(paidP)}.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onLeave} loading={leaving}>
            {paidP > 0 && !refundable ? "Leave without refund" : "Leave"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Keep my spot
          </Button>
        </div>
      </Sheet>

      <ReportSheet
        open={sheet === "report"}
        onClose={onClose}
        targetType="activity"
        targetId={activity.id}
        name="this plan"
      />

      <ShareSheet
        open={sheet === "share"}
        onClose={onClose}
        title={activity.title}
        url={shareUrl}
        shortUrl={shortUrl}
        isInvite={isInvite}
      />
    </>
  );
}
