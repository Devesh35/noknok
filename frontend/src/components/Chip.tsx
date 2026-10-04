import type { ReactNode } from "react";

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition duration-200 active:scale-95 ${
        selected
          ? "border-transparent bg-brand-600 text-white shadow-md shadow-brand-600/30"
          : "border-line bg-surface/60 text-body hover:bg-surface-hi"
      }`}
    >
      {children}
    </button>
  );
}
