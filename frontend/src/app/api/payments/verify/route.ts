import type { NextRequest } from "next/server";
import { paymentVerifyInput } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { verifyPayment } from "@/server/payments";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => {
    const input = paymentVerifyInput.parse(await readJson(request));
    return json(await verifyPayment(await requireUser(), input));
  });
}
