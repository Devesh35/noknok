import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { userByHandle } from "@/server/users";
import { UserView } from "@/views/UserView";

export const metadata: Metadata = { title: "Profile" };

// Handles both /u/me (own profile) and /u/:handle (public profile).
export default async function UserPage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  if (handle !== "me" && !(await userByHandle(handle))) notFound();
  return (
    <PageTransition>
      <UserView handle={handle} />
    </PageTransition>
  );
}
