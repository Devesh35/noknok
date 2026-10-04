"use client";

// The mock backend: one JSON document in localStorage. Everything the app
// shows is read from it through queries.ts and changed through actions.ts,
// so swapping in real API calls later only touches src/api.
import { useDeferredValue, useSyncExternalStore } from "react";
import { createSeedDb, DB_VERSION } from "@/mock/seed";
import { setTimeOffset } from "@/lib/time";
import type { Db } from "@/lib/types";

const STORAGE_KEY = "noknok.db";
const FIRST_LOAD_MS = 300; // pretend network latency, so loading states exist

const listeners = new Set<() => void>();
let current: Db | null = null;
let loadStarted = false;

function write(db: Db) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or unavailable: keep working from memory.
  }
}

function read(): Db {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    // Unreadable data falls through to a fresh seed.
  }
  const seed = createSeedDb();
  write(seed);
  return seed;
}

function publish(db: Db) {
  current = db;
  setTimeOffset(db.dev.timeOffsetMs);
  listeners.forEach((listener) => listener());
}

function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  setTimeout(() => publish(read()), FIRST_LOAD_MS);
  // Another tab changed the data.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) publish(read());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

// null while the first load is in flight. Deferred, so data changes render as
// transitions and <ViewTransition> boundaries can animate them.
export function useDb(): Db | null {
  const db = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return useDeferredValue(db);
}

// For actions and event handlers, which always run after the first load.
export function getDb(): Db {
  if (!current) throw new Error("Database is not loaded yet");
  return current;
}

// Applies a change to a copy of the database, saves it and notifies readers.
export function mutate<T>(recipe: (draft: Db) => T): T {
  const draft = structuredClone(getDb());
  const result = recipe(draft);
  write(draft);
  publish(draft);
  return result;
}

export function resetDb() {
  const seed = createSeedDb();
  write(seed);
  publish(seed);
}
