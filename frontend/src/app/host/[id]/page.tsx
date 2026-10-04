import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { HostManage } from "@/views/HostViews";

export const metadata: Metadata = { title: "Manage activity" };

export default async function Page({ params }: PageProps<"/host/[id]">) {
  const { id } = await params;
  return (
    <PageTransition>
      <div>
        <HostManage id={id} />
      </div>
    </PageTransition>
  );
}
