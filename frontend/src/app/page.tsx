import { PageTransition } from "@/components/PageTransition";
import { HomeView } from "@/views/HomeView";

export default function HomePage() {
  return (
    <PageTransition>
      <HomeView />
    </PageTransition>
  );
}
