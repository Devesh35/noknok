import type { FeeModel, PriceBreakdown } from "@/lib/types";

export const GST_RATE = 0.18; // placeholder: GST on the platform fee
export const PAYOUT_DELAY_DAYS = 2; // host is paid out T+2 after the activity ends

export type { PriceBreakdown };

// The ticket price that makes a joiner pay `totalP` under the fee model.
export function ticketFromTotal(totalP: number, feeModel: FeeModel, feePercent: number): number {
  if (feeModel === "host") return totalP;
  return Math.round(totalP / (1 + (feePercent / 100) * (1 + GST_RATE)));
}

// Activity.priceP is what a joiner pays. This is the breakdown behind it:
// the fee and GST come out of that amount, so the total is exactly the price
// and any rounding lands on the host's side.
export function breakdownForPrice(
  priceP: number,
  feeModel: FeeModel,
  feePercent: number,
): PriceBreakdown {
  const base = priceBreakdown(ticketFromTotal(priceP, feeModel, feePercent), feeModel, feePercent);
  if (feeModel === "host" || priceP === 0) return base;
  const charges = base.platformFeeP + base.gstP;
  return {
    ticketP: priceP - charges,
    platformFeeP: base.platformFeeP,
    gstP: base.gstP,
    totalP: priceP,
    hostReceivesP: priceP - charges,
  };
}

// "joiner" model adds the fee on top of the ticket; "host" model takes it out
// of the host's share. Free activities carry no fee. All amounts are paise.
export function priceBreakdown(
  priceP: number,
  feeModel: FeeModel,
  feePercent: number,
): PriceBreakdown {
  const platformFeeP = Math.round((priceP * feePercent) / 100);
  const gstP = Math.round(platformFeeP * GST_RATE);
  const charges = platformFeeP + gstP;
  return feeModel === "joiner"
    ? { ticketP: priceP, platformFeeP, gstP, totalP: priceP + charges, hostReceivesP: priceP }
    : { ticketP: priceP, platformFeeP, gstP, totalP: priceP, hostReceivesP: priceP - charges };
}
