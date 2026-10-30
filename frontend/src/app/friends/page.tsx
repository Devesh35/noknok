import type { Metadata } from "next";
import { PageTransition } from "@/components/PageTransition";
import { FriendsView } from "@/views/FriendsView";

export const metadata: Metadata = { title: "Friends" };

export default function Page() {
  return (
    <PageTransition>
      <FriendsView />
    </PageTransition>
  );
}
