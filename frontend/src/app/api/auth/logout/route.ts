import { endSession } from "@/server/auth";
import { handle, json } from "@/server/respond";

export function POST() {
  return handle(async () => {
    await endSession();
    return json(null);
  });
}
