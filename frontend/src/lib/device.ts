"use client";

// Browser capabilities that live outside the API: the "install app" prompt.
import { useSyncExternalStore } from "react";

function createValueStore<T>(initial: T) {
  const listeners = new Set<() => void>();
  let value = initial;
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// ---------- Install prompt (Android/desktop Chrome) ----------

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const installStore = createValueStore<InstallPromptEvent | null>(null);

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // keep it for our own button
    installStore.set(event as InstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => installStore.set(null));
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    installStore.subscribe,
    () => installStore.get() !== null,
    () => false,
  );
}

// True if the user accepted.
export async function promptInstall(): Promise<boolean> {
  const event = installStore.get();
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  installStore.set(null);
  return outcome === "accepted";
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
