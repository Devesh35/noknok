"use client";

import { useSyncExternalStore } from "react";

// The same activity can appear in several cards on one page, but a view
// transition name must be unique. Only the card that was last tapped carries
// the shared-element name that morphs into the Party hero.
const listeners = new Set<() => void>();
let source: string | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMorphSource(key: string) {
  source = key;
  listeners.forEach((listener) => listener());
}

export function useIsMorphSource(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => source === key,
    () => false,
  );
}

export function coverTransitionName(activityId: string): string {
  return `cover-${activityId}`;
}
