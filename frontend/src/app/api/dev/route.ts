import { devDto } from "@/server/dev";
import { handle, json } from "@/server/respond";

export function GET() {
  return handle(async () => json(await devDto()));
}
