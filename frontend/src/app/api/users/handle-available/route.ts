import type { NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { handle, json, readQuery } from "@/server/respond";
import { isHandleTaken } from "@/server/users";

export function GET(request: NextRequest) {
  return handle(async () => {
    const handleName = (readQuery(request).handle ?? "").trim().toLowerCase();
    const me = await currentUser();
    return json({ available: handleName !== "" && !(await isHandleTaken(handleName, me?._id)) });
  });
}
