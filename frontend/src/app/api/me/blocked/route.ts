import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";
import { blockedUsers } from "@/server/users";

export function GET() {
  return handle(async () => json({ items: await blockedUsers(await requireUser()) }));
}
