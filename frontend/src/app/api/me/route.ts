import type { NextRequest } from "next/server";
import { profilePatch } from "@/lib/schemas";
import { currentUser, requireUser } from "@/server/auth";
import { handle, json, readJson } from "@/server/respond";
import { deleteAccount, getMe, updateProfile } from "@/server/users";

export function GET() {
  return handle(async () => json(await getMe(await currentUser())));
}

export function PATCH(request: NextRequest) {
  return handle(async () => {
    const patch = profilePatch.parse(await readJson(request));
    return json(await updateProfile(await requireUser(), patch));
  });
}

export function DELETE() {
  return handle(async () => {
    await deleteAccount(await requireUser());
    return json(null);
  });
}
