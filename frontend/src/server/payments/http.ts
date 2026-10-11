import "server-only";

// JSON over fetch with a timeout. A non-2xx answer is a fault, not a coded
// result: the caller can't do anything about it but retry.
export async function callJson<T>(url: string, init: RequestInit, label: string): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${label} responded ${response.status}`);
  return (await response.json()) as T;
}
