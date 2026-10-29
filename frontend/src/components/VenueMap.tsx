"use client";

import dynamic from "next/dynamic";
import { readProvider, type LatLng, type LatLngBox } from "@/lib/maps/provider";

export interface VenueMapProps {
  // Where the map opens and the pin starts.
  center: LatLng;
  // Street level when the venue is already known, city level otherwise.
  zoomed: boolean;
  // Moves map and pin when it changes (a search result was picked).
  focus: (LatLng & { seq: number }) | null;
  // The host tapped the map or dragged the pin. Left out, the map is read-only:
  // a fixed pin, as on the plan page.
  onDrop?: (lat: number, lng: number) => void;
  // Keeps panning and zooming inside this box (the launch cities, in the
  // picker). Left out, the map roams.
  bounds?: LatLngBox;
  // Accessible name and size; the defaults suit the picker.
  label?: string;
  className?: string;
}

function Placeholder() {
  return (
    <div
      aria-hidden="true"
      className="h-72 w-full animate-pulse rounded-3xl border border-line"
    />
  );
}

// Each map library is its own chunk, loaded only for the provider in use.
const VenueMapOsm = dynamic(
  () => import("@/components/VenueMapOsm").then((m) => m.VenueMapOsm),
  {
    ssr: false,
    loading: Placeholder,
  },
);
const VenueMapGoogle = dynamic(
  () => import("@/components/VenueMapGoogle").then((m) => m.VenueMapGoogle),
  {
    ssr: false,
    loading: Placeholder,
  },
);

// The draggable-pin map inside VenuePicker, on whichever provider is set.
export function VenueMap(props: VenueMapProps) {
  return readProvider() === "google" ? (
    <VenueMapGoogle {...props} />
  ) : (
    <VenueMapOsm {...props} />
  );
}
