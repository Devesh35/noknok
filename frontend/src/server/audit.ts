import "server-only";
import type { ClientSession } from "mongoose";
import { AuditModel } from "@/server/models";

// Every state change records who did what (AGENTS-B rule 8). Pass the
// transaction session when there is one so the entry commits with the change.
export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  data?: unknown,
  session?: ClientSession,
) {
  await AuditModel.create([{ actorId: actorId ?? undefined, action, targetType, targetId, data }], {
    session,
  });
}
