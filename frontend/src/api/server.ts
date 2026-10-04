// Server-side reads, used for link-preview metadata. The mock database lives
// in each visitor's browser, so the server only knows the seeded activities;
// ones created in the app fall back to generic metadata until a backend exists.
import { seedActivities } from "@/mock/activities";

export interface ActivityPreview {
  title: string;
  description: string;
  coverUrl: string;
  isPrivate: boolean;
}

export function getActivityPreview(id: string): ActivityPreview | null {
  const activity = seedActivities().find((a) => a.id === id);
  if (!activity) return null;
  return {
    title: activity.title,
    description: `${activity.venueName}, ${activity.city}. ${activity.description}`,
    coverUrl: activity.coverUrl,
    isPrivate: activity.visibility !== "open",
  };
}
