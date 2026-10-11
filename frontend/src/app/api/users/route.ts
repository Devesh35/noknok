import type { NextRequest } from "next/server";
import { registerInput } from "@/lib/schemas";
import { currentUser } from "@/server/auth";
import { clientIp } from "@/server/ratelimit";
import { handle, json, readJson, readQuery } from "@/server/respond";
import { register, searchPeople } from "@/server/users";

export function GET(request: NextRequest) {
  return handle(async () => {
    const { q = "" } = readQuery(request);
    return json({ items: await searchPeople(q, await currentUser()) });
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const input = registerInput.parse(await readJson(request));
    return json(await register(input, clientIp(request)));
  });
}
