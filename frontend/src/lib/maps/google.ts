// Loads the Maps JavaScript API once, on first use (browser only).
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { GOOGLE_MAPS } from "@/lib/maps/provider";

let configured = false;

export async function loadGoogleMaps() {
  if (!configured) {
    setOptions({ key: GOOGLE_MAPS.key, v: "weekly", region: "IN", language: "en" });
    configured = true;
  }
  const [core, maps, marker] = await Promise.all([
    importLibrary("core"),
    importLibrary("maps"),
    importLibrary("marker"),
  ]);
  return {
    LatLngBounds: core.LatLngBounds,
    Map: maps.Map,
    AdvancedMarkerElement: marker.AdvancedMarkerElement,
  };
}

// The same round emoji pin the OpenStreetMap version draws (.map-pin in
// globals.css). `centered` puts the middle of the circle on the point, like
// Leaflet's iconAnchor [20, 20]; otherwise the bottom edge sits on it.
export function pinElement(emoji: string, centered: boolean): HTMLElement {
  const pin = document.createElement("span");
  pin.className = "map-pin";
  pin.textContent = emoji;
  if (centered) pin.style.transform = "translateY(50%)";
  return pin;
}
