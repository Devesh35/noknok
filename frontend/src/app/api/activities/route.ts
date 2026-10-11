import type { NextRequest } from "next/server";
import { activityInput, activityListQuery } from "@/lib/schemas";
import { createActivity } from "@/server/activities";
import { listActivities } from "@/server/activities.list";
import { currentUser, requireUser } from "@/server/auth";
import { handle, json, readJson, readQuery } from "@/server/respond";

export function GET(request: NextRequest) {
  return handle(async () => {
    const query = activityListQuery.parse(readQuery(request));
    return json(await listActivities(query, await currentUser()));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const input = activityInput.parse(await readJson(request));
    return json(await createActivity(await requireUser(), input));
  });
}
