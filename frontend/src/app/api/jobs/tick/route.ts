import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "@/server/config";
import { tick } from "@/server/jobs";
import { fail, handle, json } from "@/server/respond";

function sameSecret(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Two callers: a custom scheduler (QStash) POSTs with x-job-secret =
// JOB_SECRET; Vercel Cron GETs with Authorization: Bearer <CRON_SECRET>.
// Either configured secret admits the request. In production with neither
// set, nobody may call this (config.ts refuses to boot that way).
function run(request: NextRequest) {
  return handle(async () => {
    const jobSecret = request.headers.get("x-job-secret");
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const allowed =
      sameSecret(jobSecret, config.JOB_SECRET) ||
      sameSecret(bearer, config.CRON_SECRET) ||
      (!config.JOB_SECRET && !config.CRON_SECRET && !config.isProd);
    if (!allowed) fail("FORBIDDEN");
    await tick();
    return json({ ok: true });
  });
}

export { run as GET, run as POST };
