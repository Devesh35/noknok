import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { SettingsView } from "@/views/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <SettingsView />
        </Suspense>
      </div>
    </PageTransition>
  );
}
