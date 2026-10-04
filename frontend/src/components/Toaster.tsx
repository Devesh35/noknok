"use client";

import { useToasts } from "@/lib/toast";

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-60 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`rounded-full border border-line bg-ink px-4 py-2 text-sm font-medium text-canvas shadow-xl ${
            item.leaving ? "animate-toast-out" : "animate-toast-in"
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
