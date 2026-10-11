import { after, type NextRequest } from "next/server";
import { handleGatewayEvent, parseWebhook } from "@/server/payments";
import { handle, json } from "@/server/respond";

// Answers 200 as soon as the signature is checked; the work runs after the
// response so Razorpay never waits on the database. A bad signature is
// dropped with a 200 too: there is nothing for the sender to retry.
export function POST(request: NextRequest) {
  return handle(async () => {
    const raw = await request.text();
    const event = await parseWebhook("razorpay", raw, request.headers);
    if (event) after(() => handleGatewayEvent("razorpay", event, raw));
    return json({ ok: true });
  });
}
