// The only place the client talks HTTP. Every function in src/api goes
// through apiFetch; views never call fetch.
import { ApiError, ERROR_CODES, type ErrorCode, type Result } from "@/lib/errors";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

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
    });
  } catch {
    throw new ApiError("NETWORK", "Can't reach NokNok. Check your connection.");
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

  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = isErrorCode(error?.code) ? error.code : "SERVER";
    const message = typeof error?.message === "string" ? error.message : "Something went wrong";
    throw new ApiError(code, message);
  }
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
    });
  } catch {
    throw new ApiError("NETWORK", "Can't reach NokNok. Check your connection.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = isErrorCode(error?.code) ? error.code : "SERVER";
    const message = typeof error?.message === "string" ? error.message : "Upload failed";
    throw new ApiError(code, message);
  }
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
