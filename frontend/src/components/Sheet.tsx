"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Bottom sheet on phones, centered modal from md up. Stays mounted so it can
// animate out; `inert` and `invisible` take it out of reach while closed.
// While open it traps Tab inside the panel and returns focus on close.
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-50 flex items-end justify-center transition-[visibility] duration-300 md:items-center ${
        open ? "visible" : "invisible"
      }`}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[2rem] border border-line bg-canvas-2/95 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl outline-none backdrop-blur-xl transition duration-300 ease-out-soft md:max-w-md md:rounded-[2rem] ${
          open
            ? "translate-y-0 opacity-100 md:scale-100"
            : "translate-y-full opacity-0 md:translate-y-6 md:scale-95"
        }`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20 md:hidden" />
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
