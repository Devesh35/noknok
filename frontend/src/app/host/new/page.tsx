import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { HostWizard } from "@/views/HostWizard";

export const metadata: Metadata = { title: "Host an activity" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <HostWizard />
        </Suspense>
      </div>
    </PageTransition>
  );
}
