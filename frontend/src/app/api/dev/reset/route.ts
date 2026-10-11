import { resetDemo } from "@/server/dev";
import { handle, json } from "@/server/respond";

export function POST() {
  return handle(async () => {
    await resetDemo();
    return json(null);
  });
}
