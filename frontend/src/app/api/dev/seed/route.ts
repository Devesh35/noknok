import { seedTestEvents } from "@/server/dev.seed";
import { handle, json } from "@/server/respond";

// Dev only (the service refuses in production): adds sample hosts and events.
export function POST() {
  return handle(async () => json(await seedTestEvents()));
}
