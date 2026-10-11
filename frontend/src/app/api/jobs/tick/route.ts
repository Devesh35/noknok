import type { NextRequest } from "next/server";
import { config } from "@/server/config";
import { tick } from "@/server/jobs";
import { fail, handle, json } from "@/server/respond";

export function POST(request: NextRequest) {
  return handle(async () => {
    const secret = request.headers.get("x-job-secret");
    if (config.JOB_SECRET ? secret !== config.JOB_SECRET : config.isProd) fail("FORBIDDEN");
    await tick();
    return json({ ok: true });
  });
}
