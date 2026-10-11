import { hostHub } from "@/server/activities.host";
import { requireUser } from "@/server/auth";
import { handle, json } from "@/server/respond";

export function GET() {
  return handle(async () => json(await hostHub(await requireUser())));
}
