import {
  ROUTING_PROFILES,
  type RoutedPath,
  type RouteStep,
  type RoutesByProfile,
  type RoutingProfile,
} from "@/domain/routing";
import { config } from "@/lib/config";
import { isDeviceOffline } from "@/lib/online";
import type { GeoLineString } from "@/types/database";

const GEOCODE_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";
const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox";

/** Countries searched by default (France and French-speaking neighbours). */
const SEARCH_COUNTRIES = "fr,be,ch,lu,mc";

/** A place returned by the geocoder. coordinates are [lon, lat]. */
export interface GeocodeResult {
  id: string;
  placeName: string;
  shortName: string;
  coordinates: [number, number];
}

/** A suggestion from the Search Box API (no coordinates until retrieved). */
export interface SearchSuggestion {
  /** mapbox_id, used to retrieve full details (incl. coordinates). */
  id: string;
  /** Primary name, e.g. "EPITA". */
  name: string;
  /** Address / context line, e.g. "14-16 Rue Voltaire, Le Kremlin-Bicêtre". */
  context: string;
  /** "poi", "address", "street", "place"… */
  featureType: string | null;
  /** Distance from the proximity point, when known (metres). */
  distanceM: number | null;
}

interface MapboxGeocodeResponse {
  features?: Array<{ id: string; place_name: string; text: string; center: [number, number] }>;
}

interface SearchBoxSuggestResponse {
  suggestions?: Array<{
    name: string;
    mapbox_id: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    distance?: number;
  }>;
}

interface SearchBoxRetrieveResponse {
  features?: Array<{
    geometry: { coordinates: [number, number] };
    properties?: { name?: string; full_address?: string; place_formatted?: string };
  }>;
}

interface MapboxStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver: {
    location: [number, number];
    type: string;
    modifier?: string;
    instruction?: string;
    exit?: number;
  };
  voiceInstructions?: Array<{ distanceAlongGeometry: number; announcement: string }>;
}

interface MapboxDirectionsResponse {
  routes?: Array<{
    distance: number; // metres
    duration: number; // seconds
    geometry: GeoLineString;
    legs?: Array<{ steps?: MapboxStep[] }>;
  }>;
  code?: string;
  message?: string;
}

function buildUrl(base: string, params: Record<string, string>): string {
  const search = new URLSearchParams({ access_token: config.mapboxToken, ...params });
  return `${base}?${search.toString()}`;
}

async function fetchJson<T>(url: string, signal: AbortSignal | undefined, what: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(
      isDeviceOffline()
        ? "Pas de connexion internet."
        : `${what} injoignable. Vérifiez qu'un bloqueur de contenu ou un VPN ne bloque pas api.mapbox.com, puis réessayez.`,
    );
  }
  if (res.status === 401) throw new Error("Token Mapbox invalide (401).");
  if (!res.ok) throw new Error(`${what} indisponible (${res.status}).`);
  return (await res.json()) as T;
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
 * Results are biased toward `proximity` (the user's position) when known.
 */
export async function searchSuggest(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
  proximity?: [number, number] | null,
): Promise<SearchSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = buildUrl(`${SEARCHBOX_BASE}/suggest`, {
    q: trimmed,
    language: "fr",
    country: SEARCH_COUNTRIES,
    limit: "6",
    proximity: proximity ? `${proximity[0]},${proximity[1]}` : "ip",
    session_token: sessionToken,
  });
  const json = await fetchJson<SearchBoxSuggestResponse>(url, signal, "Recherche");
  return (json.suggestions ?? []).map((s) => ({
    id: s.mapbox_id,
    name: s.name,
    context: s.full_address ?? s.place_formatted ?? "",
    featureType: s.feature_type ?? null,
    distanceM: typeof s.distance === "number" ? s.distance : null,
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
  const json = await fetchJson<SearchBoxRetrieveResponse>(url, signal, "Localisation");
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
  const url = buildUrl(`${GEOCODE_BASE}/${lon},${lat}.json`, { language: "fr", limit: "1" });
  const json = await fetchJson<MapboxGeocodeResponse>(url, signal, "Adresse");
  const label = json.features?.[0]?.place_name ?? null;
  return label ? label.replace(/,\s*France$/, "") : null;
}

function toStep(s: MapboxStep): RouteStep {
  return {
    instruction: s.maneuver.instruction ?? "",
    maneuverType: s.maneuver.type,
    modifier: s.maneuver.modifier ?? null,
    name: s.name ?? "",
    distanceM: s.distance,
    durationS: s.duration,
    location: s.maneuver.location,
    voice: (s.voiceInstructions ?? []).map((v) => ({
      distanceAlongM: v.distanceAlongGeometry,
      announcement: v.announcement,
    })),
    exit: s.maneuver.exit ?? null,
  };
}

/**
 * Route between two [lon, lat] points for a given profile, with French
 * turn-by-turn steps and voice announcements for live navigation.
 */
export async function getRoute(
  from: [number, number],
  to: [number, number],
  profile: RoutingProfile = "driving-traffic",
  signal?: AbortSignal,
): Promise<RoutedPath> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url = buildUrl(`${DIRECTIONS_BASE}/${profile}/${coords}`, {
    geometries: "geojson",
    overview: "full",
    steps: "true",
    language: "fr",
    voice_instructions: "true",
    voice_units: "metric",
  });
  const json = await fetchJson<MapboxDirectionsResponse>(url, signal, "Itinéraire");

  const route = json.routes?.[0];
  if (!route) {
    throw new Error(json.message ?? "Aucun itinéraire trouvé entre ces points.");
  }
  return {
    profile,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry,
    steps: (route.legs?.[0]?.steps ?? []).map(toStep),
  };
}

/**
 * Fetch every profile in parallel so each transport mode gets its real
 * distance and duration (bike lanes, footpaths, live traffic…). Fails only if
 * no profile could be routed.
 */
export async function getRoutes(
  from: [number, number],
  to: [number, number],
  signal?: AbortSignal,
  profiles: readonly RoutingProfile[] = ROUTING_PROFILES,
): Promise<RoutesByProfile> {
  const settled = await Promise.allSettled(profiles.map((p) => getRoute(from, to, p, signal)));
  const routes: RoutesByProfile = {};
  let firstError: unknown = null;
  settled.forEach((r, i) => {
    const profile = profiles[i];
    if (!profile) return;
    if (r.status === "fulfilled") routes[profile] = r.value;
    else firstError ??= r.reason;
  });
  if (Object.keys(routes).length === 0) {
    throw firstError instanceof Error ? firstError : new Error("Itinéraire indisponible.");
  }
  return routes;
}
