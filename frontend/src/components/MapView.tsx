"use client";

import dynamic from "next/dynamic";
import type { Coords } from "@/lib/activity";
import { readProvider } from "@/lib/maps/provider";
import type { Activity } from "@/lib/types";

export interface MapViewProps {
  activities: Activity[];
  center: Coords;
}

function Placeholder() {
  return (
    <div
      aria-hidden="true"
      className="glass-card h-[28rem] w-full animate-pulse rounded-3xl"
    />
  );
}

// Each map library is its own chunk, loaded only for the provider in use.
const MapViewOsm = dynamic(
  () => import("@/components/MapViewOsm").then((m) => m.MapViewOsm),
  {
    ssr: false,
    loading: Placeholder,
  },
);
const MapViewGoogle = dynamic(
  () => import("@/components/MapViewGoogle").then((m) => m.MapViewGoogle),
  {
    ssr: false,
    loading: Placeholder,
  },
);

// Activities as pins; tapping one opens the plan.
export function MapView(props: MapViewProps) {
  return readProvider() === "google" ? (
    <MapViewGoogle {...props} />
  ) : (
    <MapViewOsm {...props} />
  );
}
