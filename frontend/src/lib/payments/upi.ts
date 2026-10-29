// UPI deep links for the "upi" payment provider. Opened from a tap in a
// mobile browser; on desktop they do nothing, which is why the pay sheet also
// shows a QR code.

import type { UpiPayee } from "@/lib/payments/types";

export interface UpiIntent {
  payee: UpiPayee;
  amountP: number;
  note: string;
}

// The query every UPI app understands: payee, name, amount (locked), note.
function upiQuery({ payee, amountP, note }: UpiIntent): string {
  const params = new URLSearchParams({
    pa: payee.id,
    pn: payee.name,
    am: (amountP / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return params.toString();
}

// The generic link: Android shows a chooser of installed UPI apps. Also the
// string a payment QR encodes.
export function upiLink(intent: UpiIntent): string {
  return `upi://pay?${upiQuery(intent)}`;
}

// Google Pay directly. Android registers tez://, iOS gpay://.
export function googlePayLink(intent: UpiIntent, platform: Platform): string {
  const scheme = platform === "ios" ? "gpay://upi/pay" : "tez://upi/pay";
  return `${scheme}?${upiQuery(intent)}`;
}

// A QR image of the generic link, rendered by a public QR service. Replaced
// by the host's own QR once there is one; for now it encodes the same payee.
export function upiQrUrl(intent: UpiIntent, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(upiLink(intent))}`;
}

export type Platform = "android" | "ios" | "other";

// Hands the phone to a UPI app with the amount filled in: the chooser on
// Android, Google Pay on iOS (iOS has no generic upi:// handler). Must run
// inside a tap handler or the browser blocks the app switch. Does nothing on
// a desktop, where the pay sheet's QR is the way.
export function openUpiApp(intent: UpiIntent): boolean {
  const platform = detectPlatform();
  if (platform === "other") return false;
  window.location.href = platform === "ios" ? googlePayLink(intent, platform) : upiLink(intent);
  return true;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}
