"use client";

import { useEffect, useRef, useState } from "react";
import { reversePlace, searchPlaces } from "@/api";
import { Input } from "@/components/Field";
import { MapPinIcon, SearchIcon } from "@/components/icons";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { VenueMap, type VenueMapProps } from "@/components/VenueMap";
import { areasFor, CITY_CENTERS } from "@/lib/activity";
import { CITIES, type City, type GeoPlace } from "@/lib/types";

const SEARCH_DEBOUNCE_MS = 500;
const CITY_OPTIONS: SelectOption<City>[] = CITIES.map((city) => ({ value: city, label: city }));
function areaOptions(city: City | "", current: string): SelectOption<string>[] {
  const areas = areasFor(city);
  const options = [{ value: "", label: "Pick an area" }, ...areas.map((a) => ({ value: a, label: a }))];
  // The map may name a locality we do not list; keep it selectable.
  return current && !areas.includes(current) ? [...options, { value: current, label: current }] : options;
}

export interface Venue {
  venueName: string;
  address: string;
  city: City | "";
  area: string; // locality within the city
  lat?: number;
  lng?: number;
}

// The map's names -> one of ours. Vitthalwadi comes back as a locality of
// Ulhasnagar, so the area is checked before the city. Anywhere else is
// outside NokNok for now.
function cityFrom(mapCity: string, mapArea: string): City | "" {
  const text = `${mapArea} ${mapCity}`.toLowerCase();
  if (text.includes("vitthalwadi") || text.includes("vithalwadi")) return "Vitthalwadi";
  if (text.includes("ulhasnagar")) return "Ulhasnagar";
  if (text.includes("ambernath")) return "Ambernath";
  if (text.includes("kalyan") || text.includes("dombivli")) return "Kalyan";
  return "";
}

// Search a place, or drop the pin where the plan is; the address fills in
// from the map. "Type it instead" is for places the map doesn't know.
export function VenuePicker({
  value,
  onChange,
  errors,
}: {
  value: Venue;
  onChange: (change: Partial<Venue>) => void;
  errors: Partial<Record<keyof Venue, string>>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(() => !!value.address && value.lat === undefined);
  const [focus, setFocus] = useState<VenueMapProps["focus"]>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Read once, when the map is created; later moves go through `focus`.
  const [center] = useState(() =>
    value.lat !== undefined && value.lng !== undefined
      ? { lat: value.lat, lng: value.lng }
      : CITY_CENTERS[value.city || "Ulhasnagar"],
  );
  const [zoomed] = useState(() => value.lat !== undefined);

  // Debounced search as the host types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const result = await searchPlaces(q);
      setSearching(false);
      setResults(result.ok ? result.data.items : []);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const applyPlace = (place: GeoPlace | null, lat: number, lng: number) => {
    onChangeRef.current({
      lat,
      lng,
      ...(place
        ? {
            venueName: place.name || value.venueName,
            address: place.address,
            city: cityFrom(place.city, place.area),
            area: place.area,
          }
        : {}),
    });
  };

  const pick = (place: GeoPlace) => {
    setResults([]);
    setQuery("");
    applyPlace(place, place.lat, place.lng);
    setFocus((prev) => ({ lat: place.lat, lng: place.lng, seq: (prev?.seq ?? 0) + 1 }));
  };

  const dropped = async (lat: number, lng: number) => {
    onChangeRef.current({ lat, lng });
    const result = await reversePlace(lat, lng);
    if (result.ok && result.data.place) applyPlace(result.data.place, lat, lng);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length < 2) setResults([]);
          }}
          placeholder="Search a venue, landmark or area"
          aria-label="Search for the venue"
          className="min-h-11 w-full rounded-2xl border border-line bg-surface/50 pr-3 pl-10 text-base text-ink shadow-sm outline-none placeholder:text-faint focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15"
        />
        {(results.length > 0 || searching) && (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-1 shadow-xl"
          >
            {searching && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">Searching…</li>
            )}
            {results.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => pick(place)}
                  className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-surface-hi"
                >
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {place.name || place.address.split(",")[0]}
                    </span>
                    <span className="block text-xs text-soft">{place.address}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <VenueMap center={center} zoomed={zoomed} focus={focus} onDrop={dropped} />
      <p className="text-xs text-muted">Tap the map or drag the pin to the exact spot.</p>

      {value.address && !manual && (
        <div className="rounded-2xl bg-brand-600/8 p-3 text-sm">
          <p className="font-semibold text-ink">{value.venueName || "Pinned location"}</p>
          <p className="text-soft">
            {value.address}
            {value.area ? ` · ${value.area}` : ""}
            {value.city ? ` · ${value.city}` : ""}
          </p>
        </div>
      )}
      {(errors.venueName || errors.address || errors.city) && !manual && (
        <p className="animate-rise text-sm text-red-400">
          {errors.venueName || errors.address || errors.city}
        </p>
      )}

      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="min-h-11 text-sm font-semibold text-brand-700 hover:underline"
      >
        {manual ? "Hide the address fields" : "Type the address instead"}
      </button>

      {manual && (
        <div className="animate-rise space-y-4">
          <Input
            label="Venue name"
            value={value.venueName}
            onChange={(event) => onChange({ venueName: event.target.value })}
            placeholder="Kick Arena Turf"
            error={errors.venueName}
          />
          <Input
            label="Address"
            value={value.address}
            autoComplete="street-address"
            onChange={(event) => onChange({ address: event.target.value })}
            placeholder="Street, area, pin code"
            error={errors.address}
          />
          <SelectMenu
            variant="field"
            label="City"
            value={value.city}
            onChange={(city) => onChange({ city, area: "" })}
            options={CITY_OPTIONS}
            error={errors.city}
          />
          {value.city && (
            <SelectMenu
              variant="field"
              label="Area"
              value={value.area}
              onChange={(area) => onChange({ area })}
              options={areaOptions(value.city, value.area)}
            />
          )}
        </div>
      )}
    </div>
  );
}
