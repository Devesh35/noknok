"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectMenuProps<T extends string> {
  // Accessible name. Shown above the control in the "field" variant.
  label: string;
  value: T | "";
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  error?: string;
  icon?: ReactNode;
  // "pill" for filter rows, "field" for forms (full width, visible label).
  variant?: "pill" | "field";
  // Which edge of the button the menu lines up with.
  align?: "start" | "end";
  className?: string;
}

const BUTTON = {
  pill: "min-h-11 rounded-full border border-line bg-surface/60 px-4 text-sm font-medium text-body shadow-sm hover:bg-surface-hi",
  field:
    "min-h-11 w-full rounded-2xl border bg-surface/70 px-3 text-base text-ink shadow-sm hover:bg-surface-hi",
};

// Styled replacement for <select>: a button that opens a listbox. Keyboard
// support follows the native control (arrows, Home/End, Enter, Escape, typing
// a letter). Focus stays on the button; the highlighted option is exposed
// through aria-activedescendant.
export function SelectMenu<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  error,
  icon,
  variant = "pill",
  align = "start",
  className = "",
}: SelectMenuProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const show = () => {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };

  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) show();
        else if (event.key === "ArrowDown") setActive(Math.min(active + 1, last));
        else setActive(Math.max(active - 1, 0));
        return;
      }
      case "Home":
      case "End":
        if (!open) return;
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : last);
        return;
      case "Enter":
      case " ":
        if (!open) return; // the click handler opens it
        event.preventDefault();
        choose(active);
        return;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
    }
    // Type a letter to jump to the next option starting with it.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLowerCase();
      const from = open ? active : selectedIndex;
      const order = options.map((_, index) => (from + 1 + index) % options.length);
      const match = order.find((index) => options[index].label.toLowerCase().startsWith(letter));
      if (match === undefined) return;
      if (open) setActive(match);
      else onChange(options[match].value);
    }
  };

  const isField = variant === "field";

  return (
    <div ref={rootRef} className={`relative ${isField ? "" : "inline-block"} ${className}`}>
      <span
        id={`${id}-label`}
        className={isField ? "mb-1 block text-sm font-medium text-body" : "sr-only"}
      >
        {label}
      </span>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`inline-flex items-center justify-between gap-2 outline-none transition duration-200 focus-visible:border-brand-600 focus-visible:ring-4 focus-visible:ring-brand-600/15 ${BUTTON[variant]} ${
          isField ? (error ? "border-red-400" : "border-line") : ""
        } ${open ? "border-brand-600 bg-surface ring-4 ring-brand-600/15" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon && <span aria-hidden="true">{icon}</span>}
          <span id={`${id}-value`} className={`truncate ${selected ? "" : "text-faint"}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-300 ease-out-soft ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Stays mounted so it can animate out; `invisible` hides it from everyone while closed. */}
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-labelledby={`${id}-label`}
        className={`absolute top-full z-50 mt-2 max-h-72 w-max min-w-full overflow-auto rounded-3xl border border-line bg-canvas-2 p-1.5 shadow-2xl shadow-brand-600/20 backdrop-blur-xl transition-[opacity,scale,translate,visibility] duration-200 ease-out-soft ${
          align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"
        } ${open ? "visible scale-100 opacity-100" : "invisible -translate-y-1 scale-95 opacity-0"}`}
      >
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={isSelected}
              onClick={() => choose(index)}
              onPointerMove={() => setActive(index)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-6 rounded-2xl px-3 text-sm whitespace-nowrap transition-colors duration-150 ${
                isSelected ? "font-semibold text-brand-700" : "text-body"
              } ${index === active ? "bg-brand-600/10" : ""}`}
            >
              {option.label}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-brand-600 ${isSelected ? "" : "invisible"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 5 5 9-10" />
              </svg>
            </li>
          );
        })}
      </ul>

      {error && (
        <p id={`${id}-error`} className="mt-1 animate-rise text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
