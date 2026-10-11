"use client";

import { apiUpload, safe } from "@/lib/api/client";
import type { Result } from "@/lib/errors";
import { shrinkImage } from "@/lib/image";

// Resizes a picked photo in the browser, uploads it and returns its URL.
export async function uploadImage(file: File): Promise<Result<{ url: string }>> {
  let blob: Blob;
  try {
    blob = await shrinkImage(file);
  } catch {
    return { ok: false, code: "INVALID", message: "That file doesn't look like an image" };
  }
  return safe(apiUpload<{ url: string }>("/images", blob));
}
