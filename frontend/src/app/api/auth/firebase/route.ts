import type { NextRequest } from "next/server";
import { firebaseExchangeInput } from "@/lib/schemas";
import { exchangeIdToken } from "@/server/auth.firebase";
import { clientIp } from "@/server/ratelimit";
import { handle, json, readJson } from "@/server/respond";

// Firebase ID token in, our session cookie out (or a signup token for a new number).
export function POST(request: NextRequest) {
  return handle(async () => {
    const { idToken } = firebaseExchangeInput.parse(await readJson(request));
    return json(await exchangeIdToken(idToken, clientIp(request)));
  });
}
