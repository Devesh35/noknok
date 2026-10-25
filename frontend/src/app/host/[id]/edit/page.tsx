import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { activityExists } from "@/server/activities";
import { HostWizard } from "@/views/HostWizard";

export const metadata: Metadata = { title: "Edit activity" };

export default async function Page({ params }: PageProps<"/host/[id]/edit">) {
  const { id } = await params;
  if (!(await activityExists(id))) notFound();
  return (
    <PageTransition>
      <div>
        <HostWizard activityId={id} />
      </div>
    </PageTransition>
  );
}
