import Link from "next/link";
import { buttonClass } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <EmptyState
        page
      emoji="🚪"
      title="Nobody's home"
      body="We knocked, but this page doesn't exist."
      action={
        <Link href="/" className={buttonClass("primary")}>
          Go home
        </Link>
      }
    />
  );
}
