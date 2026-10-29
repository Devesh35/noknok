"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { CATEGORY_META, LAUNCH_AREA, coordsOf } from "@/lib/activity";
import type { MapViewProps } from "@/components/MapView";

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Leaflet + OpenStreetMap tiles (free, no API key). Leaflet touches `window`,
// so it is imported inside the effect to stay out of the server render.
export function MapViewOsm({ activities, center }: MapViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | undefined;

    import("leaflet").then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      // The map can't leave the launch cities.
      const box = L.latLngBounds(
        [LAUNCH_AREA.south, LAUNCH_AREA.west],
        [LAUNCH_AREA.north, LAUNCH_AREA.east],
      );
      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        maxBounds: box,
        maxBoundsViscosity: 1,
        minZoom: 12,
      });
      map.setMinZoom(Math.max(10, map.getBoundsZoom(box)));
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(map);

      const points: [number, number][] = [];
      for (const activity of activities) {
        const { lat, lng } = coordsOf(activity);
        points.push([lat, lng]);
        const icon = L.divIcon({
          className: "",
          html: `<span class="map-pin">${CATEGORY_META[activity.category].emoji}</span>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        L.marker([lat, lng], { icon, title: activity.title, keyboard: true })
          .addTo(map)
          .on("click", () => router.push(`/party/${activity.id}`));
      }

      if (points.length > 1)
        map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
      else map.setView(points[0] ?? [center.lat, center.lng], 12);
      remove = () => map.remove();
    });

    return () => {
      disposed = true;
      remove?.();
    };
  }, [activities, center, router]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of activities"
      className="glass-card isolate h-[28rem] w-full overflow-hidden rounded-3xl"
    />
  );
}
