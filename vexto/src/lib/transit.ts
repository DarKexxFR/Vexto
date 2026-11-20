/**
 * Client for the "transit" Supabase Edge Function (Navitia proxy for IDFM
 * PRIM and SNCF national rail).
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
  type LineBadge,
  type TransitJourney,
  type TransitSearchResult,
} from "@/domain/transit";
import { isRegion, regionAt, tagId, untagId, type TransitRegion } from "@/domain/transitRegion";
import { isDeviceOffline } from "@/lib/online";
import { supabase } from "@/lib/supabase";

export type TransitErrorCode = "unreachable" | "not_deployed" | "key_missing" | "unauthorized" | "quota" | "network" | "unknown";

export { regionAt, tagId, untagId, type TransitRegion };

const REGION_INFO: Record<TransitRegion, { name: string; secret: string; site: string }> = {
  idfm: { name: "Île-de-France Mobilités (PRIM)", secret: "PRIM_API_KEY", site: "prim.iledefrance-mobilites.fr" },
  sncf: { name: "SNCF", secret: "SNCF_API_KEY", site: "numerique.sncf.com" },
};

export class TransitError extends Error {
  readonly code: TransitErrorCode;
  readonly region: TransitRegion;

  constructor(code: TransitErrorCode, message?: string, region: TransitRegion = "idfm") {
    super(message ?? code);
    this.code = code;
    this.region = region;
    this.name = "TransitError";
  }
}

function regionMessage(code: TransitErrorCode, region: TransitRegion): string | null {
  const r = REGION_INFO[region];
  if (code === "key_missing")
    return `Horaires ${r.name} indisponibles : ajoutez la clé dans Supabase (Edge Functions › Secrets, nom ${r.secret}).`;
  if (code === "unauthorized") return `La clé ${r.name} a été refusée. Vérifiez-la sur ${r.site} et dans le secret ${r.secret}.`;
  if (code === "quota") return `Quota de requêtes ${r.name} atteint pour le moment. Réessayez dans quelques minutes.`;
  return null;
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
  if (!(e instanceof TransitError)) return MESSAGES.unknown;
  return regionMessage(e.code, e.region) ?? MESSAGES[e.code];
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
    let payload: { error?: string; code?: string; region?: string } | null = null;
    try {
      payload = (await response?.json()) as { error?: string; code?: string; region?: string };
    } catch {
      payload = null;
    }
    const region = isRegion(payload?.region) ? payload.region : "idfm";
    if (payload?.error === "prim_key_missing") throw new TransitError("key_missing", undefined, region);
    if (payload?.error === "prim_unauthorized") throw new TransitError("unauthorized", undefined, region);
    if (status === 429 || payload?.error === "prim_quota") throw new TransitError("quota", undefined, region);
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

type Tagged = { vexto_region?: string };
const regionOf = (raw: Tagged | null | undefined): TransitRegion =>
  isRegion(raw?.vexto_region) ? raw.vexto_region : "idfm";

function tagBadge(line: LineBadge, region: TransitRegion): LineBadge {
  return line.id ? { ...line, id: tagId(region, line.id) } : line;
}

function tagStops(stops: StopAreaSummary[], region: TransitRegion): StopAreaSummary[] {
  return stops.map((s) => ({ ...s, id: tagId(region, s.id) }));
}

export async function fetchJourneys(from: LngLat, to: LngLat, when?: Date, count = 4): Promise<TransitJourney[]> {
  const raw = await invoke<NvJourneysResponse & Tagged>({
    action: "journeys",
    from,
    to,
    count,
    datetime: when ? toNavitiaDate(when) : undefined,
  });
  const region = regionOf(raw);
  return parseJourneys(raw).map((j) => ({
    ...j,
    legs: j.legs.map((l) => (l.line ? { ...l, line: tagBadge(l.line, region) } : l)),
  }));
}

export async function fetchNearbyStops(at: LngLat, distanceM?: number): Promise<StopAreaSummary[]> {
  const raw = await invoke<NvPlacesNearbyResponse & Tagged>({ action: "nearby", at, distance: distanceM });
  return tagStops(parseNearby(raw), regionOf(raw));
}

export async function fetchDepartures(stopAreaId: string): Promise<DepartureGroup[]> {
  const { region, id } = untagId(stopAreaId);
  const raw = await invoke<NvDeparturesResponse>({ action: "departures", stopAreaId: id, region });
  return parseDepartures(raw).map((g) => ({ ...g, line: tagBadge(g.line, region) }));
}

/** Search lines and stops on the local network around `near` plus national rail. */
export async function searchTransit(q: string, near?: LngLat | null): Promise<TransitSearchResult[]> {
  if (q.trim().length < 2) return [];
  const raw = await invoke<{ results?: { region: string; data: NvPtObjectsResponse }[] }>({
    action: "search",
    q,
    near: near ?? undefined,
  });
  return (raw.results ?? []).flatMap(({ region: r, data }) => {
    const region = isRegion(r) ? r : "idfm";
    return parseSearch(data).map((res) =>
      res.kind === "line"
        ? { ...res, id: tagId(region, res.id), badge: tagBadge(res.badge, region) }
        : { ...res, id: tagId(region, res.id) },
    );
  });
}

export async function fetchLine(lineId: string): Promise<LineDetail | null> {
  const { region, id } = untagId(lineId);
  const raw = await invoke<{ line: NvLineResponse; stops: NvStopAreasResponse }>({ action: "line", lineId: id, region });
  const detail = parseLine(raw.line, raw.stops);
  return detail ? { ...detail, badge: tagBadge(detail.badge, region), stops: tagStops(detail.stops, region) } : null;
}
