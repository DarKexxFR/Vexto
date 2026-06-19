import type { GeoLineString, GeoPoint } from "@/types/database";

/** Build a GeoJSON Point from lon/lat (the order PostGIS expects). */
export function point(lon: number, lat: number): GeoPoint {
  return { type: "Point", coordinates: [lon, lat] };
}

/** Build a GeoJSON LineString from an ordered list of [lon, lat] coords. */
export function lineString(coords: Array<[number, number]>): GeoLineString {
  return { type: "LineString", coordinates: coords };
}

/**
 * EWKT for a point, e.g. `SRID=4326;POINT(2.35 48.85)`. PostGIS geometry
 * columns accept EWKT on insert (they do NOT parse raw GeoJSON), so we convert
 * before sending to Supabase.
 */
export function pointToEwkt(p: GeoPoint): string {
  const [lon, lat] = p.coordinates;
  return `SRID=4326;POINT(${lon} ${lat})`;
}

/** EWKT for a line, e.g. `SRID=4326;LINESTRING(2.3 48.8, 2.4 48.9)`. */
export function lineToEwkt(l: GeoLineString): string {
  const body = l.coordinates.map(([lon, lat]) => `${lon} ${lat}`).join(", ");
  return `SRID=4326;LINESTRING(${body})`;
}

/**
 * Haversine great-circle distance in kilometres between two [lon, lat] points.
 * Used as a client-side fallback when no routed distance is available.
 */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371; // Earth radius (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length (km) of a GPS track expressed as [lon, lat] points. */
export function trackLengthKm(coords: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (prev && curr) total += haversineKm(prev, curr);
  }
  return total;
}
