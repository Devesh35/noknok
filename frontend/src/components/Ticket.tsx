"use client";

import { QRCodeSVG } from "qrcode.react";
import type { PriceBreakdown } from "@/lib/fees";
import { formatDateTime, formatInr } from "@/lib/format";
import type { Activity, FeeModel, Join, User } from "@/lib/types";

// The ticket a joiner shows at the door. The QR encodes the join id, which the
// host enters on the manage page to check them in.
export function TicketCard({
  join,
  activity,
  holder,
}: {
  join: Join;
  activity: Activity;
  holder: User;
}) {
  const cancelled = join.status === "host_cancelled";
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-lg">
      <div className="bg-brand-600 px-5 py-4 text-white">
        <p className="text-xs font-semibold tracking-widest uppercase opacity-80">NokNok ticket</p>
        <h3 className="truncate text-lg font-bold">{activity.title}</h3>
      </div>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className={`shrink-0 rounded-2xl bg-white p-2 ${cancelled ? "opacity-30" : ""}`}>
          <QRCodeSVG value={join.id} size={112} level="M" title={`Ticket ${join.id}`} />
        </div>
        <dl className="min-w-0 space-y-1.5 text-sm">
          <div>
            <dt className="text-xs text-muted">Name</dt>
            <dd className="truncate font-semibold text-ink">{holder.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">When</dt>
            <dd className="font-semibold text-ink">{formatDateTime(activity.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Where</dt>
            <dd className="truncate font-semibold text-ink">{activity.venueName}</dd>
          </div>
        </dl>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-dashed border-line px-5 py-3 text-sm">
        <span className="font-mono font-semibold tracking-wider text-ink">{join.id}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            cancelled
              ? "bg-red-500/15 text-red-300"
              : join.checkedInAt
                ? "bg-success/15 text-success"
                : "bg-brand-600/10 text-brand-700"
          }`}
        >
          {cancelled
            ? `Cancelled · ${formatInr(join.refundedP)} refunded`
            : join.checkedInAt
              ? "Checked in ✓"
              : join.ticketP + join.feeP > 0
                ? `Paid ${formatInr(join.ticketP + join.feeP)}`
                : "Free entry"}
        </span>
      </div>
    </div>
  );
}

// Line items shown before paying.
export function PriceRows({ price, feeModel }: { price: PriceBreakdown; feeModel: FeeModel }) {
  const row = "flex items-center justify-between gap-4 py-1.5 text-sm text-body";
  const onJoiner = feeModel === "joiner";
  return (
    <dl>
      <div className={row}>
        <dt>Ticket</dt>
        <dd>{formatInr(price.ticketP)}</dd>
      </div>
      <div className={row}>
        <dt>Platform fee{onJoiner ? "" : " (paid by host)"}</dt>
        <dd className={onJoiner ? "" : "text-faint line-through"}>
          {formatInr(price.platformFeeP)}
        </dd>
      </div>
      <div className={row}>
        <dt>GST on fee (placeholder)</dt>
        <dd className={onJoiner ? "" : "text-faint line-through"}>{formatInr(price.gstP)}</dd>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-3 text-base font-bold text-ink">
        <dt>You pay</dt>
        <dd>{formatInr(price.totalP)}</dd>
      </div>
    </dl>
  );
}
