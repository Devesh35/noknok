import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { UserView } from "@/views/UserView";

export const metadata: Metadata = { title: "Profile" };

// Handles both /u/me (own profile) and /u/:handle (public profile).
export default async function UserPage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  return (
    <PageTransition>
      <UserView handle={handle} />
    </PageTransition>
  );
}
