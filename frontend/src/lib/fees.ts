import type { FeeModel } from "@/lib/types";

export const GST_RATE = 0.18; // placeholder: GST on the platform fee
export const PAYOUT_DELAY_DAYS = 2; // host is paid out T+2 after the activity ends

export interface PriceBreakdown {
  ticket: number;
  platformFee: number;
  gst: number;
  total: number; // what the joiner pays
  hostReceives: number;
}

// "joiner" model adds the fee on top of the ticket; "host" model takes it out
// of the host's share. Free activities carry no fee.
export function priceBreakdown(
  priceInr: number,
  feeModel: FeeModel,
  feePercent: number,
): PriceBreakdown {
  const platformFee = Math.round((priceInr * feePercent) / 100);
  const gst = Math.round(platformFee * GST_RATE);
  const charges = platformFee + gst;
  return feeModel === "joiner"
    ? { ticket: priceInr, platformFee, gst, total: priceInr + charges, hostReceives: priceInr }
    : { ticket: priceInr, platformFee, gst, total: priceInr, hostReceives: priceInr - charges };
}
