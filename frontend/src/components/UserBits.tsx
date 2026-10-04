import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import type { User } from "@/lib/types";

// Static trust badges: "phone verified" and "ID verified".
export function VerifiedBadges({ user }: { user: Pick<User, "phoneVerified" | "idVerified"> }) {
  if (!user.phoneVerified && !user.idVerified) return null;
  const badge =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {user.phoneVerified && (
        <span className={`${badge} bg-success/15 text-success`}>✓ Phone</span>
      )}
      {user.idVerified && <span className={`${badge} bg-accent/15 text-accent`}>✓ ID</span>}
    </span>
  );
}

// A person in a list, with room for a note and an action on the right.
export function UserRow({
  user,
  note,
  action,
}: {
  user: User;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card flex items-center gap-3 rounded-3xl p-3">
      <Link href={`/u/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={user} />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-sm text-muted">
            {note ?? `@${user.handle} · ${user.city}`}
          </span>
        </span>
      </Link>
      {action}
    </div>
  );
}

const STAR_SIZES = { sm: "text-base", lg: "text-4xl" };

// Read-only when onChange is omitted.
export function Stars({
  value,
  onChange,
  size = "sm",
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: keyof typeof STAR_SIZES;
}) {
  if (!onChange) {
    return (
      <span className={`${STAR_SIZES[size]} text-warning`} aria-label={`${value} out of 5`}>
        {"★".repeat(Math.round(value))}
        <span className="text-ink/20">{"★".repeat(5 - Math.round(value))}</span>
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label="Rating" className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
          className={`min-h-11 min-w-11 transition duration-200 active:scale-90 ${STAR_SIZES[size]} ${
            star <= value ? "text-warning" : "text-ink/20 hover:text-warning/60"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
