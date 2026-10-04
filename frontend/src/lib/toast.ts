"use client";

import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  message: string;
  leaving: boolean;
}

const TOAST_MS = 2600;
const LEAVE_MS = 250; // matches the toast-out animation
const EMPTY: ToastItem[] = [];
const listeners = new Set<() => void>();
let toasts: ToastItem[] = EMPTY;
let nextId = 1;

function emit(next: ToastItem[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toast(message: string) {
  const id = nextId++;
  emit([...toasts, { id, message, leaving: false }]);
  setTimeout(
    () => emit(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t))),
    TOAST_MS,
  );
  setTimeout(() => emit(toasts.filter((t) => t.id !== id)), TOAST_MS + LEAVE_MS);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
}
