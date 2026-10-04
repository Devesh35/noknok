import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { HostWizard } from "@/views/HostWizard";

export const metadata: Metadata = { title: "Edit activity" };

export default async function Page({ params }: PageProps<"/host/[id]/edit">) {
  const { id } = await params;
  return (
    <PageTransition>
      <div>
        <HostWizard activityId={id} />
      </div>
    </PageTransition>
  );
}
