import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth";
import { storeImage } from "@/server/images";
import { handle, json } from "@/server/respond";

// Raw image bytes in the body; the content-type header says which kind.
export function POST(request: NextRequest) {
  return handle(async () => {
    const me = await requireUser();
    const contentType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const data = Buffer.from(await request.arrayBuffer());
    return json({ url: await storeImage(me, contentType, data) }, 201);
  });
}
