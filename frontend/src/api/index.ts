// The app's data layer. Today it is a mock backed by localStorage; later these
// become calls to the real backend. Views import from here, never from
// src/mock. Server components use src/api/server.ts instead.
export { useDb } from "@/api/db";
export * from "@/api/queries";
export * from "@/api/actions";
export * from "@/api/payments";
export { PaymentError } from "@/lib/razorpay";
