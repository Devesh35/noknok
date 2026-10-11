import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError, ERROR_STATUS, type ErrorCode } from "@/lib/errors";

// Route handlers wrap their body in handle() so every failure becomes the
// same `{ error: { code, message } }` shape (AGENTS-B rule 9).
export function fail(code: ErrorCode, message?: string): never {
  throw new ApiError(code, message);
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: ERROR_STATUS[error.code] || 500 },
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const message = first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: { code: "INVALID", message } }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "SERVER", message: "Something went wrong" } },
    { status: 500 },
  );
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    return errorResponse(error);
  }
}

// Parses a JSON body; an empty body is {}.
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    fail("INVALID", "Body must be JSON");
  }
}

export function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
