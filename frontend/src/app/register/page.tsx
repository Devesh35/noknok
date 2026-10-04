import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { AuthFlow } from "@/views/AuthFlow";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <AuthFlow />
        </Suspense>
      </div>
    </PageTransition>
  );
}
