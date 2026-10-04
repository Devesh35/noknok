import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { NotificationsView } from "@/views/NotificationsView";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <NotificationsView />
        </Suspense>
      </div>
    </PageTransition>
  );
}
