import { requireUser } from "@/server/auth";
import { notificationsFor } from "@/server/notify";
import { handle, json } from "@/server/respond";

export function GET() {
  return handle(async () => json({ items: await notificationsFor((await requireUser())._id) }));
}
