import type { NextRequest } from "next/server";
import { loadImage } from "@/server/images";
import { fail, handle } from "@/server/respond";

// Ids are random, so an image is as private as its link; cache it hard.
export function GET(_request: NextRequest, ctx: RouteContext<"/api/images/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const image = await loadImage(id);
    if (!image) fail("NOT_FOUND");
    return new Response(new Uint8Array(image.data), {
      headers: {
        "content-type": image.contentType,
        "content-length": String(image.size),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });
}
