import type { ReactNode } from "react";

interface EmptyStateProps {
  emoji: string;
  title: string;
  body?: string;
  action?: ReactNode;
  // Plain variant drops the dashed card, for use inside another card.
  plain?: boolean;
  // Standalone on a page (not inside a padded container): adds outer margin.
  page?: boolean;
}

// Dashed "nothing here yet" card: the illustration floats in a glowing disc
// with a few sparkles, then the title, body and one action.
export function EmptyState({
  emoji,
  title,
  body,
  action,
  plain = false,
  page = false,
}: EmptyStateProps) {
  return (
    <div
      className={`relative flex flex-col items-center overflow-hidden px-6 py-12 text-center md:py-16 ${
        plain ? "" : "rounded-[2rem] border border-dashed border-line bg-surface/30"
      } ${page ? "m-4 md:mx-auto md:my-8 md:max-w-4xl" : ""}`}
    >
      {!plain && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-line/60"
        />
      )}
      <span className="relative mb-4 inline-flex h-32 w-32 items-center justify-center md:h-36 md:w-36">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-radial from-brand-600/35 via-brand-600/10 to-transparent"
        />
        <span
          aria-hidden="true"
          className="absolute top-3 right-4 h-1.5 w-1.5 rounded-full bg-ink/80 animate-float"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-6 left-3 h-1 w-1 rounded-full bg-accent/80 animate-float [animation-delay:1.2s]"
        />
        <span
          aria-hidden="true"
          className="absolute top-10 -left-2 h-2 w-2 rounded-full bg-brand-500/70 animate-float [animation-delay:2.4s]"
        />
        <span
          aria-hidden="true"
          className="absolute -right-3 bottom-8 h-2.5 w-2.5 rounded-full bg-location/70 animate-float [animation-delay:0.6s]"
        />
        <span className="relative animate-pop text-6xl drop-shadow-lg md:text-7xl" aria-hidden="true">
          {emoji}
        </span>
      </span>
      <div className="stagger flex flex-col items-center">
        <h2 className="max-w-md text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
          {title}
        </h2>
        {body && <p className="mt-2 max-w-sm text-base text-soft">{body}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
