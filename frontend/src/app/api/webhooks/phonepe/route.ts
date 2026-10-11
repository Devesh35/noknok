import { after, type NextRequest } from "next/server";
import { handleGatewayEvent, parseWebhook } from "@/server/payments";
import { handle, json } from "@/server/respond";

// PhonePe authenticates with SHA256("user:pass") in the Authorization header.
// Same shape as the Razorpay route: check, answer 200, work in after().
export function POST(request: NextRequest) {
  return handle(async () => {
    const raw = await request.text();
    const event = await parseWebhook("phonepe", raw, request.headers);
    if (event) after(() => handleGatewayEvent("phonepe", event, raw));
    return json({ ok: true });
  });
}
