import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { HostHub } from "@/views/HostViews";

export const metadata: Metadata = { title: "Host" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <HostHub />
        </Suspense>
      </div>
    </PageTransition>
  );
}
