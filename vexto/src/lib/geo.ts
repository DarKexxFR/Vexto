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
