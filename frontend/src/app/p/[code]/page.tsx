import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { shortCodeExists } from "@/server/activities";
import { ShortLink } from "@/views/ShortLink";

export const metadata: Metadata = { title: "Opening invite" };

// Short invite links: /p/AB12CD.
export default async function Page({ params }: PageProps<"/p/[code]">) {
  const { code } = await params;
  if (!(await shortCodeExists(code))) notFound();
  return (
    <Suspense fallback={null}>
      <ShortLink code={code} />
    </Suspense>
  );
}
