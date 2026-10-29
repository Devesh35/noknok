"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { MapViewProps } from "@/components/MapView";
import { CATEGORY_META, LAUNCH_AREA, coordsOf } from "@/lib/activity";
import { loadGoogleMaps, pinElement } from "@/lib/maps/google";
import { GOOGLE_MAPS } from "@/lib/maps/provider";

const FIT_PADDING = 40;
const MAX_FIT_ZOOM = 14;

// Google Maps JavaScript API with Advanced Markers; same props and pins as
// the OpenStreetMap version.
export function MapViewGoogle({ activities, center }: MapViewProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let markers: google.maps.marker.AdvancedMarkerElement[] = [];

    loadGoogleMaps().then(({ Map, AdvancedMarkerElement, LatLngBounds }) => {
      if (disposed || !containerRef.current) return;
      const map = new Map(containerRef.current, {
        mapId: GOOGLE_MAPS.mapId,
        center,
        zoom: 12,
        gestureHandling: "cooperative",
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        // The map can't leave the launch cities.
        restriction: { latLngBounds: LAUNCH_AREA, strictBounds: true },
        minZoom: 12,
      });

      const bounds = new LatLngBounds();
      markers = activities.map((activity) => {
        const position = coordsOf(activity);
        bounds.extend(position);
        const marker = new AdvancedMarkerElement({
          map,
          position,
          title: activity.title,
          content: pinElement(CATEGORY_META[activity.category].emoji, true),
          gmpClickable: true,
        });
        marker.addListener("gmp-click", () =>
          router.push(`/party/${activity.id}`),
        );
        return marker;
      });

      if (activities.length > 1) {
        map.fitBounds(bounds, FIT_PADDING);
        google.maps.event.addListenerOnce(map, "idle", () => {
          if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
        });
      } else if (activities[0]) {
        map.setCenter(coordsOf(activities[0]));
      }
    });

    return () => {
      disposed = true;
      for (const marker of markers) marker.map = null;
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
