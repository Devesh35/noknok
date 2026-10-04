import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { DevView } from "@/views/DevView";

export const metadata: Metadata = { title: "Developer tools" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <DevView />
        </Suspense>
      </div>
    </PageTransition>
  );
}
