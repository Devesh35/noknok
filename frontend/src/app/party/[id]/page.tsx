import type { Metadata } from "next";
import { Suspense } from "react";
import { getActivityPreview } from "@/server/activities";
import { PageTransition } from "@/components/PageTransition";
import { PartyView } from "@/views/PartyView";

// Server-rendered title, description and image so a shared /party/:id link
// gets a preview card. Private plans don't leak their details into previews.
export async function generateMetadata({ params }: PageProps<"/party/[id]">): Promise<Metadata> {
  const { id } = await params;
  const preview = await getActivityPreview(id);
  if (!preview) return { title: "Activity on NokNok" };
  if (preview.isPrivate) {
    return { title: "A private plan", description: "You've been invited to a plan on NokNok." };
  }
  return {
    title: preview.title,
    description: preview.description,
    openGraph: {
      title: preview.title,
      description: preview.description,
      images: preview.coverUrl ? [preview.coverUrl] : undefined,
    },
  };
}

export default async function PartyPage({ params }: PageProps<"/party/[id]">) {
  const { id } = await params;
  return (
    <PageTransition>
      <div>
        <Suspense fallback={null}>
          <PartyView id={id} />
        </Suspense>
      </div>
    </PageTransition>
  );
}
