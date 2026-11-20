/**
 * Client for the "transit" Supabase Edge Function (IDFM PRIM / Navitia proxy).
 * Returns parsed app shapes and typed errors so screens can explain what to
 * configure when real-time data is unavailable.
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import type { LngLat } from "@/domain/navigation";
import {
  parseDepartures,
  parseJourneys,
  parseLine,
  parseNearby,
  parseSearch,
  toNavitiaDate,
  type DepartureGroup,
  type LineDetail,
  type NvDeparturesResponse,
  type NvJourneysResponse,
  type NvLineResponse,
  type NvPlacesNearbyResponse,
  type NvPtObjectsResponse,
  type NvStopAreasResponse,
  type StopAreaSummary,
  type TransitJourney,
  type TransitSearchResult,
} from "@/domain/transit";
import { isDeviceOffline } from "@/lib/online";
import { supabase } from "@/lib/supabase";

export type TransitErrorCode = "unreachable" | "not_deployed" | "key_missing" | "unauthorized" | "quota" | "network" | "unknown";

export class TransitError extends Error {
  readonly code: TransitErrorCode;

  constructor(code: TransitErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "TransitError";
  }
}

const MESSAGES: Record<TransitErrorCode, string> = {
  not_deployed: "Horaires temps réel indisponibles : déployez la fonction Supabase « transit » (voir README).",
  key_missing: "Horaires temps réel indisponibles : ajoutez votre clé PRIM (secret PRIM_API_KEY) à Supabase.",
  unauthorized: "La clé PRIM a été refusée par Île-de-France Mobilités. Vérifiez-la sur prim.iledefrance-mobilites.fr.",
  quota: "Quota de requêtes PRIM atteint pour le moment. Réessayez dans quelques minutes.",
  network: "Pas de connexion internet. Réessayez dans un instant.",
  unreachable:
    "Le service d'horaires ne répond pas. Le plus souvent, la fonction Supabase « transit » n'est pas encore déployée (voir README, étape 2).",
  unknown: "Service d'horaires momentanément indisponible.",
};

export function transitErrorMessage(e: unknown): string {
  return e instanceof TransitError ? MESSAGES[e.code] : MESSAGES.unknown;
}

/** True when the feature itself is not configured (vs. a transient failure). */
export function isTransitSetupError(e: unknown): boolean {
  return e instanceof TransitError && (e.code === "not_deployed" || e.code === "unreachable" || e.code === "key_missing" || e.code === "unauthorized");
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("transit", { body });
  if (!error) return data as T;

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;
    const status = response?.status ?? 0;
    let payload: { error?: string; code?: string } | null = null;
    try {
      payload = (await response?.json()) as { error?: string; code?: string };
    } catch {
      payload = null;
    }
    if (payload?.error === "prim_key_missing") throw new TransitError("key_missing");
    if (payload?.error === "prim_unauthorized") throw new TransitError("unauthorized");
    if (status === 429 || payload?.error === "prim_quota") throw new TransitError("quota");
    if (status === 404) throw new TransitError("not_deployed");
    throw new TransitError("unknown", payload?.error);
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    if (error instanceof FunctionsRelayError) throw new TransitError("not_deployed");
    // A missing function answers 404 without CORS headers: the browser then
    // reports a network failure although the phone is online.
    throw new TransitError(isDeviceOffline() ? "network" : "unreachable");
  }
  throw new TransitError("unknown", error instanceof Error ? error.message : String(error));
}

export async function fetchJourneys(from: LngLat, to: LngLat, when?: Date, count = 4): Promise<TransitJourney[]> {
  const raw = await invoke<NvJourneysResponse>({
    action: "journeys",
    from,
    to,
    count,
    datetime: when ? toNavitiaDate(when) : undefined,
  });
  return parseJourneys(raw);
}

export async function fetchNearbyStops(at: LngLat, distanceM = 600): Promise<StopAreaSummary[]> {
  return parseNearby(await invoke<NvPlacesNearbyResponse>({ action: "nearby", at, distance: distanceM }));
}

export async function fetchDepartures(stopAreaId: string): Promise<DepartureGroup[]> {
  return parseDepartures(await invoke<NvDeparturesResponse>({ action: "departures", stopAreaId }));
}

export async function searchTransit(q: string): Promise<TransitSearchResult[]> {
  if (q.trim().length < 2) return [];
  return parseSearch(await invoke<NvPtObjectsResponse>({ action: "search", q }));
}

export async function fetchLine(lineId: string): Promise<LineDetail | null> {
  const raw = await invoke<{ line: NvLineResponse; stops: NvStopAreasResponse }>({ action: "line", lineId });
  return parseLine(raw.line, raw.stops);
}
