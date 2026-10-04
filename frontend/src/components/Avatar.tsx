import type { User } from "@/lib/types";

const COLORS = [
  "bg-linear-to-br from-violet-500 to-fuchsia-500",
  "bg-linear-to-br from-emerald-400 to-teal-600",
  "bg-linear-to-br from-sky-400 to-indigo-500",
  "bg-linear-to-br from-rose-400 to-pink-600",
  "bg-linear-to-br from-amber-400 to-orange-500",
  "bg-linear-to-br from-teal-400 to-cyan-600",
  "bg-linear-to-br from-indigo-400 to-violet-600",
  "bg-linear-to-br from-pink-400 to-rose-500",
];

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-10 w-10 text-sm",
  lg: "h-20 w-20 text-2xl",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return COLORS[hash % COLORS.length];
}

interface AvatarProps {
  user: Pick<User, "name" | "handle" | "avatarUrl">;
  size?: keyof typeof SIZES;
  className?: string;
}

export function Avatar({ user, size = "md", className = "" }: AvatarProps) {
  const base = `inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface-hi ${SIZES[size]} ${className}`;
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={user.name} className={`${base} object-cover`} />;
  }
  return (
    <span className={`${base} ${colorFor(user.handle)}`} title={user.name} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 5 }: { users: User[]; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((user) => (
        <Avatar key={user.id} user={user} />
      ))}
      {extra > 0 && (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 text-xs font-semibold text-body ring-2 ring-surface-hi backdrop-blur">
          +{extra}
        </span>
      )}
    </div>
  );
}
