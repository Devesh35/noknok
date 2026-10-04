"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { CATEGORY_META, coordsOf, type Coords } from "@/lib/activity";
import type { Activity } from "@/lib/types";

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Leaflet + OpenStreetMap tiles (free, no API key). Leaflet touches `window`,
// so it is imported inside the effect to stay out of the server render.
export function MapView({
  activities,
  center,
  you,
}: {
  activities: Activity[];
  center: Coords;
  you: Coords | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | undefined;

    import("leaflet").then(({ default: L }) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
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
      if (you) {
        points.push([you.lat, you.lng]);
        L.circleMarker([you.lat, you.lng], {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#fb7185",
          fillOpacity: 1,
        }).addTo(map);
      }

      if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
      else map.setView(points[0] ?? [center.lat, center.lng], 12);
      remove = () => map.remove();
    });

    return () => {
      disposed = true;
      remove?.();
    };
  }, [activities, center, you, router]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of activities"
      className="glass-card isolate h-[28rem] w-full overflow-hidden rounded-3xl"
    />
  );
}
