import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { activityExists, getActivityPreview } from "@/server/activities";
import { PageTransition } from "@/components/PageTransition";
import { PartyView } from "@/views/PartyView";

const FALLBACK_DESCRIPTION = "A plan on NokNok. See who's going and join in.";

// Server-rendered title, description and image so a shared /party/:id link
// gets a preview card. Private plans don't leak their details into previews.
export async function generateMetadata({ params }: PageProps<"/party/[id]">): Promise<Metadata> {
  const { id } = await params;
  const preview = await getActivityPreview(id);
  if (!preview) return { title: "Activity on NokNok", description: FALLBACK_DESCRIPTION };
  if (preview.isPrivate) {
    return { title: "A private plan", description: "You've been invited to a plan on NokNok." };
  }
  // Short and never empty: a plan with a blank description still gets one.
  const description =
    preview.description.trim().replace(/\s+/g, " ").slice(0, 160) || FALLBACK_DESCRIPTION;
  return {
    title: preview.title,
    description,
    openGraph: {
      title: preview.title,
      description,
      images: preview.coverUrl ? [preview.coverUrl] : undefined,
    },
  };
}

export default async function PartyPage({ params }: PageProps<"/party/[id]">) {
  const { id } = await params;
  if (!(await activityExists(id))) notFound();
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
