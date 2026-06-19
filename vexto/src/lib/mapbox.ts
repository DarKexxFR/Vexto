import { config } from "@/lib/config";
import type { GeoLineString, TripMode } from "@/types/database";

const GEOCODE_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox";

/** Mapbox Directions routing profiles we use. */
export type DirectionsProfile = "driving" | "walking" | "cycling";

/**
 * Pick the routing profile that best matches a transport mode so the route
 * (distance, duration, geometry) reflects how you'd actually travel.
 * Mapbox Directions has no transit profile — public transit falls back to
 * driving as a distance baseline until GTFS routing is wired in.
 */
export function profileForMode(mode: TripMode): DirectionsProfile {
  switch (mode) {
    case "walk":
      return "walking";
    case "bike":
    case "eScooter":
      return "cycling";
    case "carThermal":
    case "publicTransit":
    default:
      return "driving";
  }
}

/** A place returned by the geocoder. coordinates are [lon, lat]. */
export interface GeocodeResult {
  id: string;
  placeName: string;
  shortName: string;
  coordinates: [number, number];
}

/** Outcome of a Directions request. */
export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  geometry: GeoLineString;
}

interface MapboxGeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
}

interface MapboxGeocodeResponse {
  features?: MapboxGeocodeFeature[];
}

interface MapboxDirectionsResponse {
  routes?: Array<{
    distance: number; // metres
    duration: number; // seconds
    geometry: GeoLineString;
  }>;
  code?: string;
  message?: string;
}

function buildUrl(base: string, params: Record<string, string>): string {
  const search = new URLSearchParams({
    access_token: config.mapboxToken,
    ...params,
  });
  return `${base}?${search.toString()}`;
}

/** A suggestion from the Search Box API (no coordinates until retrieved). */
export interface SearchSuggestion {
  /** mapbox_id, used to retrieve full details (incl. coordinates). */
  id: string;
  /** Primary name, e.g. "EPITA". */
  name: string;
  /** Address / context line, e.g. "14-16 Rue Voltaire, Le Kremlin-Bicêtre". */
  context: string;
}

interface SearchBoxSuggestResponse {
  suggestions?: Array<{
    name: string;
    mapbox_id: string;
    full_address?: string;
    place_formatted?: string;
  }>;
}

interface SearchBoxRetrieveResponse {
  features?: Array<{
    geometry: { coordinates: [number, number] };
    properties?: { name?: string; full_address?: string; place_formatted?: string };
  }>;
}

/** Opaque session token tying suggest + retrieve calls into one billed session. */
export function createSearchSession(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Forward search via the Search Box API. Unlike the legacy geocoder, this
 * matches POIs, brands and landmarks (e.g. "EPITA"), not just postal addresses.
 * Returns suggestions without coordinates — call {@link retrieveSuggestion}
 * with the same session token once the user picks one.
 */
export async function searchSuggest(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = buildUrl(`${SEARCHBOX_BASE}/suggest`, {
    q: trimmed,
    language: "fr",
    country: "fr",
    limit: "6",
    proximity: "ip",
    session_token: sessionToken,
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Recherche échouée (${res.status})`);
  const json = (await res.json()) as SearchBoxSuggestResponse;

  return (json.suggestions ?? []).map((s) => ({
    id: s.mapbox_id,
    name: s.name,
    context: s.full_address ?? s.place_formatted ?? "",
  }));
}

/** Resolve a suggestion's coordinates. Reuse the suggest session token. */
export async function retrieveSuggestion(
  mapboxId: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<GeocodeResult> {
  const url = buildUrl(`${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}`, {
    language: "fr",
    session_token: sessionToken,
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Localisation échouée (${res.status})`);
  const json = (await res.json()) as SearchBoxRetrieveResponse;

  const feature = json.features?.[0];
  if (!feature) throw new Error("Lieu introuvable.");

  const name = feature.properties?.name ?? "";
  const context = feature.properties?.full_address ?? feature.properties?.place_formatted ?? "";
  return {
    id: mapboxId,
    placeName: context || name,
    shortName: name || context,
    coordinates: feature.geometry.coordinates,
  };
}

/** Reverse geocoding: turn [lon, lat] into a human-readable label. */
export async function reverseGeocode(
  coordinates: [number, number],
  signal?: AbortSignal,
): Promise<string | null> {
  const [lon, lat] = coordinates;
  const url = buildUrl(`${GEOCODE_BASE}/${lon},${lat}.json`, {
    language: "fr",
    limit: "1",
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Reverse geocoding échoué (${res.status})`);
  const json = (await res.json()) as MapboxGeocodeResponse;
  return json.features?.[0]?.place_name ?? null;
}

/**
 * Route between two [lon, lat] points for a given profile. The geometry,
 * distance and duration follow the chosen profile (e.g. walking uses footpaths,
 * cycling uses bike lanes), so the displayed itinerary matches the mode.
 */
export async function getRoute(
  from: [number, number],
  to: [number, number],
  profile: DirectionsProfile = "driving",
  signal?: AbortSignal,
): Promise<RouteResult> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = buildUrl(`${DIRECTIONS_BASE}/${profile}/${coords}`, {
    geometries: "geojson",
    overview: "full",
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Calcul d'itinéraire échoué (${res.status})`);
  const json = (await res.json()) as MapboxDirectionsResponse;

  const route = json.routes?.[0];
  if (!route) {
    throw new Error(json.message ?? "Aucun itinéraire trouvé entre ces points.");
  }

  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry,
  };
}
