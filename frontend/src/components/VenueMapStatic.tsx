"use client";

import { useState } from "react";
import { buttonClass } from "@/components/Button";
import { MapPinIcon } from "@/components/icons";
import { VenueMap } from "@/components/VenueMap";
import { boundsAround, readProvider, type LatLng } from "@/lib/maps/provider";

// How far the interactive map lets people wander from the venue.
const EXPLORE_RADIUS_KM = 5;
const TILE = 256;
const ZOOM = 15;

interface VenueMapStaticProps {
  center: LatLng;
  venueName: string;
  mapsHref: string;
  className?: string;
}

// Slippy-map tile that contains the point, plus where inside it the point sits.
function tileAt({ lat, lng }: LatLng) {
  const n = 2 ** ZOOM;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    fx: x - Math.floor(x),
    fy: y - Math.floor(y),
  };
}

// Nine OpenStreetMap tiles around the venue, as plain images: no map library
// and the tiles stay in the browser's cache between visits.
function OsmTiles({ center }: { center: LatLng }) {
  const { x, y, fx, fy } = tileAt(center);
  const offsets = [-1, 0, 1];
  return (
    <div
      aria-hidden="true"
      className="absolute grid grid-cols-3"
      style={{
        width: TILE * 3,
        height: TILE * 3,
        left: `calc(50% - ${TILE + fx * TILE}px)`,
        top: `calc(50% - ${TILE + fy * TILE}px)`,
      }}
    >
      {offsets.flatMap((dy) =>
        offsets.map((dx) => (
          <img
            key={`${dx},${dy}`}
            src={`https://tile.openstreetmap.org/${ZOOM}/${x + dx}/${y + dy}.png`}
            alt=""
            width={TILE}
            height={TILE}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )),
      )}
    </div>
  );
}

// The plan page's map: a cached still picture with the pin, which turns into
// the real map (kept within a few km of the venue) only when tapped.
export function VenueMapStatic({
  center,
  venueName,
  mapsHref,
  className = "h-72",
}: VenueMapStaticProps) {
  const [live, setLive] = useState(false);
  // Google's still needs the Maps Static API on the server key; without it
  // the route answers 404/500 and the OpenStreetMap tiles stand in.
  const [googleStill, setGoogleStill] = useState(
    () => readProvider() === "google",
  );

  if (live) {
    return (
      <VenueMap
        center={center}
        zoomed
        focus={null}
        bounds={boundsAround(center, EXPLORE_RADIUS_KM)}
        label={`Map showing ${venueName}`}
        className={className}
      />
    );
  }

  return (
    <div
      className={`relative isolate w-full overflow-hidden rounded-3xl border border-line bg-surface ${className}`}
    >
      {googleStill ? (
        <img
          src={`/api/maps/static?lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}`}
          alt={`Map showing ${venueName}`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setGoogleStill(false)}
        />
      ) : (
        <>
          <OsmTiles center={center} />
          <span
            aria-hidden="true"
            className="map-pin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[90%]"
          >
            📍
          </span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-2 bottom-2 rounded bg-canvas/80 px-1.5 py-0.5 text-[10px] text-soft"
          >
            © OpenStreetMap
          </a>
        </>
      )}
      <button
        type="button"
        onClick={() => setLive(true)}
        className="absolute inset-0 cursor-pointer bg-transparent"
        aria-label={`Explore the map around ${venueName}`}
      >
        <span className="sr-only">Explore the map</span>
      </button>
      <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2">
        <span className="glass rounded-full px-3 py-1.5 text-xs font-semibold text-ink">
          Tap to explore
        </span>
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass(
            "secondary",
            "pointer-events-auto min-h-9 px-3 py-1.5 text-xs",
          )}
        >
          <MapPinIcon className="h-4 w-4 text-location" />
          Open in Maps
        </a>
      </div>
    </div>
  );
}
