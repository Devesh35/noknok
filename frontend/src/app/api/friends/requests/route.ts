import type { NextRequest } from "next/server";
import { friendRequestInput } from "@/lib/schemas";
import { requireUser } from "@/server/auth";
import { sendFriendRequest } from "@/server/friends";
import { handle, json, readJson } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => {
    const { toId } = friendRequestInput.parse(await readJson(request));
    return json(await sendFriendRequest(await requireUser(), toId));
  });
}
