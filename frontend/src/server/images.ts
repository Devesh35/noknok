import "server-only";
import { HOUR_MS } from "@/lib/time";
import { newId } from "@/lib/ids";
import { audit } from "@/server/audit";
import { connectDb } from "@/server/db";
import { ImageModel, type ImageDoc, type UserDoc } from "@/server/models";
import { rateLimit } from "@/server/ratelimit";
import { fail } from "@/server/respond";

// Cover photos live in MongoDB: the app runs on serverless hosts with no disk,
// and a resized JPEG is a few hundred KB. The browser shrinks before upload;
// this is the hard ceiling.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const UPLOADS_PER_HOUR = 30;

// The bytes must start like the type they claim: the header alone is the
// uploader's word, and anything stored here is served back to other people.
const SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  "image/jpeg": (d) => d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff,
  "image/png": (d) => d.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (d) => d.toString("latin1", 0, 4) === "RIFF" && d.toString("latin1", 8, 12) === "WEBP",
};

export async function storeImage(me: UserDoc, contentType: string, data: Buffer): Promise<string> {
  rateLimit(`image:${me._id}`, UPLOADS_PER_HOUR, HOUR_MS);
  const matches = SIGNATURES[contentType];
  if (!matches) fail("INVALID", "Use a JPEG, PNG or WebP image");
  if (data.length === 0) fail("INVALID", "The file is empty");
  if (data.length > MAX_IMAGE_BYTES) fail("INVALID", "Keep the image under 3 MB");
  if (!matches(data)) fail("INVALID", "That file isn't a JPEG, PNG or WebP image");
  await connectDb();
  const id = newId("img");
  await ImageModel.create({ _id: id, userId: me._id, contentType, data, size: data.length });
  await audit(me._id, "image.upload", "image", id, { size: data.length });
  return `/api/images/${id}`;
}

// Lean documents hand back the driver's Binary rather than a Buffer.
export async function loadImage(id: string): Promise<ImageDoc | null> {
  await connectDb();
  const doc = await ImageModel.findById(id).lean();
  if (!doc) return null;
  const raw = doc.data as unknown as { buffer?: Uint8Array };
  const data = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(raw.buffer ?? doc.data);
  return { ...doc, data };
}
