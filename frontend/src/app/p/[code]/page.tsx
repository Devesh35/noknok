import type { Metadata } from "next";
import { Suspense } from "react";
import { ShortLink } from "@/views/ShortLink";

export const metadata: Metadata = { title: "Opening invite" };

// Short invite links: /p/AB12CD.
export default async function Page({ params }: PageProps<"/p/[code]">) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <ShortLink code={code} />
    </Suspense>
  );
}
