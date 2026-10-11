"use client";

import { useEffect, useState, ViewTransition, type ReactNode } from "react";
import {
  ApiError,
  joinWaitlist,
  leaveActivity,
  payAndJoin,
  PaymentError,
  toggleInterested,
  useActivity,
  useSession,
  type ErrorCode,
} from "@/api";
import { Button } from "@/components/Button";
import { Cover } from "@/components/Cover";
import { EmptyState } from "@/components/EmptyState";
import { ShareIcon } from "@/components/icons";
import { formatDateTime, formatInr } from "@/lib/format";
import { coverTransitionName } from "@/lib/morph";
import { now } from "@/lib/time";
import { toast } from "@/lib/toast";
import type { ActivityDetail, SessionDto } from "@/lib/types";
import {
  BackButton,
  HostBlock,
  InviteCapture,
  LockedParty,
  NotFound,
  OVERLAY_BUTTON,
  PartySkeleton,
  PriceLabel,
  ReviewCard,
} from "@/views/PartyBits";
import {
  PartyBody,
  PartyCta,
  PartyHeader,
  type CtaState,
} from "@/views/PartySections";
import {
  PartySheets,
  type PaymentState,
  type SheetName,
} from "@/views/PartySheets";

// Join attempts the server turned down for a reason the page can show inline.
type JoinIssue = "FULL" | "PAST" | "NOT_VISIBLE";
const JOIN_ISSUE_TEXT: Record<JoinIssue, string> = {
  FULL: "It filled up just now. You can join the waitlist instead.",
  PAST: "This activity has already ended.",
  NOT_VISIBLE: "You no longer have access to this plan.",
};

function isJoinIssue(code: ErrorCode): code is JoinIssue {
  return code === "FULL" || code === "PAST" || code === "NOT_VISIBLE";
}

export function PartyView({ id }: { id: string }) {
  const { data, error, refetch } = useActivity(id);
  const { data: session } = useSession();

  if (error) {
    if (error.code === "NOT_FOUND") return <NotFound />;
    return (
      <ViewTransition key="error" enter="fade-in" default="none">
        <div>
          <EmptyState
            emoji="📡"
            title="Couldn't load this plan"
            body={error.message}
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        </div>
      </ViewTransition>
    );
  }
  if (data === undefined || session === undefined) {
    return (
      <ViewTransition key="skeleton" exit="fade-out" default="none">
        <PartySkeleton />
      </ViewTransition>
    );
  }

  const capture = <InviteCapture activityId={data.activity.id} />;
  if (!data.viewer.canView) {
    return (
      <ViewTransition key="locked" enter="fade-in" default="none">
        <div>
          {capture}
          <LockedParty
            activity={data.activity}
            host={data.host}
            hostStats={data.hostStats}
            mutual={data.viewer.mutualWithHost}
            viewer={session.user}
            request={data.viewer.friendRequest}
          />
        </div>
      </ViewTransition>
    );
  }
  return (
    <PartyContent
      data={data}
      session={session}
      refetch={refetch}
      capture={capture}
    />
  );
}

function PartyContent({
  data,
  session,
  refetch,
  capture,
}: {
  data: ActivityDetail;
  session: SessionDto;
  refetch: () => void;
  capture: ReactNode;
}) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [payment, setPayment] = useState<PaymentState>("idle");
  // Back from a redirect gateway via the back/forward cache: the page comes
  // back as it was left, mid-"processing". Reset it.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setPayment("idle");
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  const [busy, setBusy] = useState(false);
  const [joinIssue, setJoinIssue] = useState<JoinIssue | null>(null);

  const {
    activity,
    host,
    hostStats,
    attendees,
    breakdown: price,
    refundable,
  } = data;
  const viewer = session.user;
  const isHost = viewer?.id === activity.hostId;
  const spotsLeft = Math.max(activity.capacity - activity.goingCount, 0);
  const myJoin = data.viewer.join;
  const past = Date.parse(activity.endsAt) < now();
  const cancelled = activity.status === "cancelled";
  const inviter = data.viewer.invite?.inviter;

  const interested = data.viewer.interested;
  const friends = data.viewer.friendsGoing;
  const canBeInterested =
    !cancelled && !past && !isHost && myJoin?.status !== "going";

  // A failed write that isn't transient means the page is stale: show why and
  // refetch so the CTA reflects what the server knows.
  const explainFailure = (code: ErrorCode, message: string) => {
    if (code === "NOT_LOGGED_IN") setSheet("login");
    else if (isJoinIssue(code)) {
      setJoinIssue(code);
      refetch();
    } else toast(message);
  };

  const toggleInterest = async () => {
    if (!viewer) {
      setSheet("login");
      return;
    }
    const result = await toggleInterested(activity.id);
    if (!result.ok) explainFailure(result.code, result.message);
    else
      toast(
        result.data.interested
          ? "Saved. Find it under Profile › Joined."
          : "Removed",
      );
  };

  // "Share my plan": lets someone know where the user will be.
  const sharePlan = async () => {
    const text = `${viewer?.name ?? "I"} is going to ${activity.title}
${formatDateTime(
  activity.startsAt,
)} · ${activity.venueName}, ${activity.address}
${pageUrl}`;
    try {
      if (typeof navigator.share === "function")
        await navigator.share({ title: activity.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Plan details copied. Paste them to a friend.");
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  let state: CtaState;
  if (cancelled) state = "cancelled";
  else if (past) state = "ended";
  else if (isHost) state = "hosting";
  else if (myJoin?.status === "going") state = "joined";
  else if (myJoin?.status === "waitlisted") state = "waitlisted";
  else if (!viewer) state = "anonymous";
  else if (spotsLeft === 0) state = "full";
  else state = "open";

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shareParams = new URLSearchParams();
  if (viewer) shareParams.set("ref", viewer.id);
  const isInviteLink = isHost && activity.visibility !== "open";
  if (isInviteLink && activity.inviteToken)
    shareParams.set("invite", activity.inviteToken);
  const query = shareParams.toString();
  const pageUrl = `${origin}/party/${activity.id}`;
  const shareUrl = query ? `${pageUrl}?${query}` : pageUrl;

  const pay = async () => {
    if (!viewer) {
      setSheet("login");
      return;
    }
    setPayment("processing");
    setJoinIssue(null);
    try {
      const join = await payAndJoin(
        activity.id,
        session,
        viewer,
        activity.title,
        activity.priceP,
      );
      // null: the browser is on its way to the gateway; stay "processing".
      if (!join) return;
      setPayment("idle");
      setSheet("success");
    } catch (error) {
      setPayment("idle");
      if (error instanceof PaymentError && error.reason === "dismissed") return;
      if (error instanceof PaymentError) {
        setPayment("failed");
        setSheet("checkout");
      } else if (error instanceof ApiError) {
        setSheet(null);
        explainFailure(error.code, error.message);
      } else {
        toast("Couldn't join");
      }
    }
  };

  const startJoin = () => {
    if (price.totalP > 0) {
      setPayment("idle");
      setSheet("checkout");
    } else {
      pay();
    }
  };

  const leave = async () => {
    setBusy(true);
    const result = await leaveActivity(activity.id);
    setBusy(false);
    if (!result.ok) {
      explainFailure(result.code, result.message);
      return;
    }
    setSheet(null);
    const { refundedP } = result.data;
    toast(
      refundedP > 0
        ? `You left. ${formatInr(refundedP)} will be refunded.`
        : "You left this activity",
    );
  };

  const leaveWaitlist = async () => {
    setBusy(true);
    const result = await leaveActivity(activity.id);
    setBusy(false);
    if (!result.ok) explainFailure(result.code, result.message);
    else toast("You left the waitlist");
  };

  const waitlistNote =
    activity.waitlistMode === "approval"
      ? "The host picks who gets a spot."
      : "You get the next free spot automatically.";

  const joinTheWaitlist = async () => {
    setBusy(true);
    setJoinIssue(null);
    const result = await joinWaitlist(activity.id);
    setBusy(false);
    if (!result.ok) explainFailure(result.code, result.message);
    else toast(`You're on the waitlist. ${waitlistNote}`);
  };

  const cta = (
    <PartyCta
      state={state}
      activity={activity}
      waitlistPosition={data.viewer.waitlistPosition}
      totalP={price.totalP}
      busy={busy}
      payment={payment}
      onSheet={setSheet}
      onStartJoin={startJoin}
      onJoinWaitlist={joinTheWaitlist}
      onLeaveWaitlist={leaveWaitlist}
    />
  );

  const interestButton = canBeInterested && (
    <Button
      variant="secondary"
      aria-pressed={interested}
      aria-label={interested ? "Remove from interested" : "I'm interested"}
      onClick={toggleInterest}
      className={interested ? "text-location" : ""}
    >
      {interested ? "♥" : "♡"}
    </Button>
  );
  const issueNote = joinIssue && (
    <p role="alert" className="animate-rise text-xs font-medium text-warning">
      {JOIN_ISSUE_TEXT[joinIssue]}
    </p>
  );

  return (
    <ViewTransition key="content" enter="fade-in" default="none">
      <div className="pb-32 lg:px-8 lg:pt-6 lg:pb-12">
        {capture}
        <div className="relative">
          <ViewTransition
            name={coverTransitionName(activity.id)}
            share="morph"
            default="none"
          >
            <Cover
              activity={activity}
              float
              className={`h-64 w-full rounded-b-[2rem] shadow-xl shadow-brand-600/15 lg:h-80 lg:rounded-[2rem] ${
                cancelled ? "grayscale" : ""
              }`}
              emojiClassName="text-8xl"
            />
          </ViewTransition>
          <div className="absolute inset-x-0 top-0 flex justify-between p-3">
            <BackButton />
            <button
              type="button"
              aria-label="Share"
              onClick={() => setSheet("share")}
              className={OVERLAY_BUTTON}
            >
              <ShareIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="gap-8 px-4 pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:px-0 lg:pt-6">
          <div className="stagger space-y-6">
            {cancelled && (
              <div
                role="status"
                className="rounded-3xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
              >
                <p className="font-bold">
                  This activity was cancelled by the host.
                </p>
                {myJoin?.status === "host_cancelled" &&
                  myJoin.refundedP > 0 && (
                    <p>
                      {formatInr(myJoin.refundedP)} is being refunded to you.
                    </p>
                  )}
              </div>
            )}

            <PartyHeader
              activity={activity}
              inviter={inviter}
              pageUrl={pageUrl}
              live={!past && !cancelled}
            />

            <HostBlock
              host={host}
              stats={hostStats}
              mutual={data.viewer.mutualWithHost}
              friend={data.viewer.isFriendOfHost}
            />

            {past &&
              !cancelled &&
              viewer &&
              !isHost &&
              myJoin?.status === "going" && (
                <ReviewCard
                  activityId={activity.id}
                  existing={data.viewer.review}
                />
              )}

            <PartyBody
              activity={activity}
              attendees={attendees}
              friends={friends}
              spotsLeft={spotsLeft}
              live={!past && !cancelled}
              waitlistNote={waitlistNote}
            />

            {!isHost && (
              <button
                type="button"
                onClick={() => setSheet(viewer ? "report" : "login")}
                className="min-h-11 text-sm font-semibold text-muted hover:text-ink hover:underline"
              >
                Report this plan
              </button>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="glass sticky top-20 animate-rise space-y-4 rounded-[2rem] p-5">
              <PriceLabel activity={activity} />
              <div className="flex gap-2">
                {interestButton}
                {cta}
              </div>
              {issueNote}
              <p className="text-xs text-muted">
                {session.paymentProvider === "fake"
                  ? "Prototype: no real payment is taken."
                  : session.paymentEnv === "test"
                    ? "Test mode: use a test card or UPI id, no real money moves."
                    : "Payments are processed securely by our payment partner."}
              </p>
            </div>
          </aside>
        </div>

        <div className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[1.75rem] px-4 py-3 lg:hidden">
          {issueNote && <div className="pb-2">{issueNote}</div>}
          <div className="flex items-center gap-3">
            <PriceLabel activity={activity} />
            <div className="flex flex-1 gap-2">
              {interestButton}
              {cta}
            </div>
          </div>
        </div>

        <PartySheets
          sheet={sheet}
          onClose={() => setSheet(null)}
          activity={activity}
          viewer={viewer}
          myJoin={myJoin}
          price={price}
          feeModel={session.dev.feeModel}
          refundable={refundable}
          payment={payment}
          onPay={pay}
          onLeave={leave}
          leaving={busy}
          onSharePlan={sharePlan}
          shareUrl={shareUrl}
          shortUrl={`${origin}/p/${activity.shortCode}`}
          isInvite={isInviteLink}
        />
      </div>
    </ViewTransition>
  );
}
