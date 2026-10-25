import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Vercel Cron GETs with a bearer token; QStash POSTs with x-job-secret. Both
// must reach tick(); nobody else may.
const tick = vi.fn(async () => {});
vi.mock("@/server/jobs", () => ({ tick }));

let route: typeof import("./route");

beforeAll(async () => {
  process.env.CRON_SECRET = "cron-secret-for-tests";
  process.env.JOB_SECRET = "job-secret-for-tests";
  route = await import("./route");
});

function request(method: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/jobs/tick", { method, headers });
}

describe("/api/jobs/tick", () => {
  it("runs for Vercel Cron's GET with the bearer secret", async () => {
    tick.mockClear();
    const res = await route.GET(request("GET", { authorization: "Bearer cron-secret-for-tests" }));
    expect(res.status).toBe(200);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("runs for a scheduler's POST with x-job-secret", async () => {
    tick.mockClear();
    const res = await route.POST(request("POST", { "x-job-secret": "job-secret-for-tests" }));
    expect(res.status).toBe(200);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("refuses a wrong, missing or differently-long secret", async () => {
    tick.mockClear();
    const cases: Record<string, string>[] = [
      {},
      { authorization: "Bearer nope" },
      { authorization: "Bearer cron-secret-for-tests-but-longer" },
      { "x-job-secret": "cron-secret-for-tests" }, // right value, wrong header
    ];
    for (const headers of cases) {
      const res = await route.GET(request("GET", headers));
      expect(res.status).toBe(403);
    }
    expect(tick).not.toHaveBeenCalled();
  });
});
