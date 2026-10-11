"use client";

import { useEffect, useRef } from "react";
import type { VenueMapProps } from "@/components/VenueMap";
import { loadGoogleMaps, pinElement } from "@/lib/maps/google";
import { GOOGLE_MAPS } from "@/lib/maps/provider";

interface GoogleBits {
  map: google.maps.Map;
  marker: google.maps.marker.AdvancedMarkerElement;
}

type MarkerPosition = google.maps.marker.AdvancedMarkerElement["position"];

function latLngOf(position: MarkerPosition): { lat: number; lng: number } | null {
  if (!position) return null;
  if (position instanceof google.maps.LatLng) return { lat: position.lat(), lng: position.lng() };
  return { lat: Number(position.lat), lng: Number(position.lng) };
}

// Google Maps with a draggable Advanced Marker; same behaviour as the
// OpenStreetMap version.
export function VenueMapGoogle({ center, zoomed, focus, onDrop }: VenueMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bits = useRef<GoogleBits | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    let disposed = false;
    loadGoogleMaps().then(({ Map, AdvancedMarkerElement }) => {
      if (disposed || !containerRef.current || bits.current) return;
      const map = new Map(containerRef.current, {
        mapId: GOOGLE_MAPS.mapId,
        center,
        zoom: zoomed ? 16 : 12,
        gestureHandling: "cooperative",
        clickableIcons: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      const marker = new AdvancedMarkerElement({
        map,
        position: center,
        content: pinElement("📍", false),
        gmpDraggable: true,
        title: "Venue",
      });
      marker.addListener("dragend", () => {
        const at = latLngOf(marker.position);
        if (at) onDropRef.current(at.lat, at.lng);
      });
      map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (!event.latLng) return;
        marker.position = event.latLng;
        onDropRef.current(event.latLng.lat(), event.latLng.lng());
      });
      bits.current = { map, marker };
    });
    return () => {
      disposed = true;
      if (bits.current) bits.current.marker.map = null;
      bits.current = null;
    };
    // The map is created once; later moves arrive through `focus`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focus || !bits.current) return;
    bits.current.map.setCenter(focus);
    bits.current.map.setZoom(16);
    bits.current.marker.position = focus;
  }, [focus]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map: tap or drag the pin to the venue"
      className="isolate h-64 w-full overflow-hidden rounded-3xl border border-line"
    />
  );
}
