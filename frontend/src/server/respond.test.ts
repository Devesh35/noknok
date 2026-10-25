import { describe, expect, it } from "vitest";
import { errorResponse } from "@/server/respond";

describe("errorResponse", () => {
  it("answers a duplicate-key race with a conflict, not a server error", async () => {
    const dup = Object.assign(new Error("E11000 duplicate key error collection: users index: handle_1"), {
      code: 11000,
    });
    const res = errorResponse(dup);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).not.toMatch(/E11000|handle_1/); // nothing internal leaks
  });

  it("still hides unknown errors behind a generic 500", async () => {
    const res = errorResponse(new Error("ECONNRESET to mongodb://secret@host"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe("Something went wrong");
  });
});
