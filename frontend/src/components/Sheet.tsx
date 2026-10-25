"use client";

import { useEffect, useRef, type ReactNode } from "react";

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

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Listeners live on the document, not the panel, so Escape and Tab work
  // even when focus hasn't landed inside yet (or a click moved it out).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // The panel only becomes focusable once `inert` is gone and the
    // visibility transition has left "hidden" (it starts hidden, so the first
    // frame is too early). Retry briefly until focus lands inside.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const focusPanel = () => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      panel.focus();
      if (!panel.contains(document.activeElement) && ++tries < 15) timer = setTimeout(focusPanel, 30);
    };
    timer = setTimeout(focusPanel, 0);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const active = document.activeElement;
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

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
