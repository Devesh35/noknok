"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { VenueMapProps } from "@/components/VenueMap";

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface LeafletBits {
  map: import("leaflet").Map;
  marker: import("leaflet").Marker;
}

// Leaflet + OpenStreetMap. Leaflet touches `window`, so it is imported inside
// the effect.
export function VenueMapOsm({ center, zoomed, focus, onDrop, label, className }: VenueMapProps) {
  const editable = onDrop !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const leaflet = useRef<LeafletBits | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    let disposed = false;
    import("leaflet").then(({ default: L }) => {
      if (disposed || !containerRef.current || leaflet.current) return;
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<span class="map-pin">📍</span>',
        iconSize: [40, 40],
        iconAnchor: [20, 36],
      });
      const marker = L.marker([center.lat, center.lng], { icon, draggable: editable }).addTo(map);
      if (editable) {
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLatLng();
          onDropRef.current?.(lat, lng);
        });
        map.on("click", (event) => {
          marker.setLatLng(event.latlng);
          onDropRef.current?.(event.latlng.lat, event.latlng.lng);
        });
      }
      map.setView([center.lat, center.lng], zoomed ? 16 : 12);
      leaflet.current = { map, marker };
    });
    return () => {
      disposed = true;
      leaflet.current?.map.remove();
      leaflet.current = null;
    };
    // The map is created once; later moves arrive through `focus`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focus || !leaflet.current) return;
    leaflet.current.map.setView([focus.lat, focus.lng], 16);
    leaflet.current.marker.setLatLng([focus.lat, focus.lng]);
  }, [focus]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={label ?? "Map: tap or drag the pin to the venue"}
      className={`isolate w-full overflow-hidden rounded-3xl border border-line ${className ?? "h-64"}`}
    />
  );
}
