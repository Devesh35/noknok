import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { activityExists } from "@/server/activities";
import { HostManage } from "@/views/HostViews";

export const metadata: Metadata = { title: "Manage activity" };

export default async function Page({ params }: PageProps<"/host/[id]">) {
  const { id } = await params;
  if (!(await activityExists(id))) notFound();
  return (
    <PageTransition>
      <div>
        <HostManage id={id} />
      </div>
    </PageTransition>
  );
}
