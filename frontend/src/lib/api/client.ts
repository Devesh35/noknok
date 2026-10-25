// The only place the client talks HTTP. Every function in src/api goes
// through apiFetch; views never call fetch.
import { ApiError, ERROR_CODES, type ErrorCode, type Result } from "@/lib/errors";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

// A request that hangs is reported as a network error instead of a spinner
// that never ends. Uploads get longer: a few hundred KB over mobile data.
const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

// Views that need to know the session died (so the shell shows the logged-out
// state) register here; the query layer does, once.
let onLoggedOut: (() => void) | null = null;
export function setLoggedOutHandler(handler: () => void) {
  onLoggedOut = handler;
}

function networkError(error: unknown): ApiError {
  const timedOut = error instanceof DOMException && error.name === "TimeoutError";
  return new ApiError(
    "NETWORK",
    timedOut ? "NokNok is taking too long to answer. Try again." : "Can't reach NokNok. Check your connection.",
  );
}

function fromPayload(payload: unknown, fallback: string): ApiError {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = isErrorCode(error?.code) ? error.code : "SERVER";
  const message = typeof error?.message === "string" ? error.message : fallback;
  if (code === "NOT_LOGGED_IN") onLoggedOut?.();
  return new ApiError(code, message);
}

interface Options {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function withQuery(path: string, query?: Options["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// Throws ApiError. Use safe() for a Result instead.
export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${withQuery(path, options.query)}`, {
      method: options.method ?? "GET",
      headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw networkError(error);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) throw fromPayload(payload, "Something went wrong");
  return payload as T;
}

// Sends a binary body (an image) instead of JSON.
export async function apiUpload<T>(path: string, blob: Blob): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "content-type": blob.type },
      body: blob,
      credentials: "same-origin",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw networkError(error);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw fromPayload(payload, "Upload failed");
  return payload as T;
}

export async function safe<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, code: error.code, message: error.message };
    return { ok: false, code: "SERVER", message: "Something went wrong" };
  }
}
