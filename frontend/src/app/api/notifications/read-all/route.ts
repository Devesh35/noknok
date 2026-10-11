import { requireUser } from "@/server/auth";
import { markAllRead } from "@/server/notify";
import { handle, json } from "@/server/respond";

export function POST() {
  return handle(async () => {
    await markAllRead((await requireUser())._id);
    return json(null);
  });
}
