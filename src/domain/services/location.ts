// Which place the weather is for. A profile's own pick wins; without one the
// server's default city applies. Whoever chose the place, stored coordinates
// are used as they are: only a bare name (no coordinates) is geocoded, because
// Open-Meteo ranks matches by population and a bare "Brest" lands in Belarus.

import type { GeoCandidate, GeoCoord, Units } from "../model/weather";

// A stored place: a name, and its coordinates when it was picked from the list.
export interface Residence {
  city: string;
  units: Units;
  lat: number | null;
  lon: number | null;
}

// What the widget does next: use `coord` as is, or geocode `city` when null.
export interface ResolvedLocation {
  city: string;
  coord: GeoCoord | null;
}

// A latitude or longitude that may arrive as a number or a string (host config
// values are coerced from the schema type, profile prefs are strings). Empty,
// non-numeric or out-of-range values give null.
export function parseCoord(value: unknown, max: number): number | null {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value.trim());
  else return null;
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

export const parseLat = (v: unknown): number | null => parseCoord(v, 90);
export const parseLon = (v: unknown): number | null => parseCoord(v, 180);

export function parseUnits(value: unknown): Units | null {
  return value === "fahrenheit" || value === "celsius" ? value : null;
}

// Profile pref (city + coordinates) over the server default (city + coordinates).
export function resolveLocation(
  pref: { city: string | null; lat: unknown; lon: unknown },
  server: { city: string; lat: number | null; lon: number | null },
): ResolvedLocation {
  const prefCity = pref.city?.trim() ?? "";
  if (prefCity) {
    return { city: prefCity, coord: toCoord(prefCity, parseLat(pref.lat), parseLon(pref.lon)) };
  }
  const city = server.city.trim();
  return { city, coord: toCoord(city, server.lat, server.lon) };
}

function toCoord(name: string, lat: number | null, lon: number | null): GeoCoord | null {
  return lat !== null && lon !== null ? { lat, lon, name } : null;
}

// Coordinates within this many degrees are the same place (a few km).
const SAME_PLACE_DEG = 0.05;

// The search list shown when the panel opens is rebuilt from the stored name,
// so it starts on the most populous homonym. When the stored place has
// coordinates, keep it selected: the matching candidate if the search returned
// it, otherwise the stored place itself, put first. Returns the list to show
// and the index to select.
export function preselect(
  candidates: GeoCandidate[],
  current: Residence,
): { list: GeoCandidate[]; index: number } {
  if (current.lat === null || current.lon === null || !current.city.trim()) {
    return { list: candidates, index: 0 };
  }
  const { lat, lon } = current;
  const i = candidates.findIndex(
    (c) => Math.abs(c.lat - lat) <= SAME_PLACE_DEG && Math.abs(c.lon - lon) <= SAME_PLACE_DEG,
  );
  if (i >= 0) return { list: candidates, index: i };
  return { list: [{ name: current.city.trim(), lat, lon }, ...candidates], index: 0 };
}
