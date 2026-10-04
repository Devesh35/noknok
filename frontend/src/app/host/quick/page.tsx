import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { QuickHost } from "@/views/QuickHost";

export const metadata: Metadata = { title: "Quick plan" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <QuickHost />
      </div>
    </PageTransition>
  );
}
