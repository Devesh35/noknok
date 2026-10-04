import type { ReactNode } from "react";

interface EmptyStateProps {
  emoji: string;
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ emoji, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="animate-pop text-6xl drop-shadow-lg" aria-hidden="true">
        {emoji}
      </span>
      <div className="stagger flex flex-col items-center">
        <h2 className="mt-3 text-lg font-bold text-ink">{title}</h2>
        {body && <p className="mt-1 max-w-sm text-sm text-soft">{body}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
