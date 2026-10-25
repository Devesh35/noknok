import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = { title: "Offline" };

// Served by the service worker when a page can't be loaded.
export default function OfflinePage() {
  return (
    <EmptyState
        page
      emoji="📡"
      title="You're offline"
      body="NokNok needs a connection to load this page. Check your network and try again."
    />
  );
}
