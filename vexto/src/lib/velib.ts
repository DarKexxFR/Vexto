/**
 * Live Vélib' availability. Paris Open Data first (filtered server-side by
 * distance, CORS-enabled for the website), Vélib' Métropole GBFS as a
 * fallback. No API key.
 */
import {
  inVelibArea,
  nearestStations,
  parseGbfsStations,
  parseOdsStations,
  type BikeNeed,
  type BikeStation,
  type GbfsInformation,
  type GbfsStatus,
  type OdsVelibRecord,
} from "@/domain/bikeshare";
import type { LngLat } from "@/domain/navigation";

const ODS_URL =
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records";
const GBFS_BASE = "https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Vélib' indisponible (${res.status}).`);
  return (await res.json()) as T;
}

// GBFS is ~1 500 stations: keep it for a minute.
let gbfsCache: { at: number; stations: BikeStation[] } | null = null;

async function fromGbfs(signal?: AbortSignal): Promise<BikeStation[]> {
  if (gbfsCache && Date.now() - gbfsCache.at < 60_000) return gbfsCache.stations;
  const [info, status] = await Promise.all([
    getJson<GbfsInformation>(`${GBFS_BASE}/station_information.json`, signal),
    getJson<GbfsStatus>(`${GBFS_BASE}/station_status.json`, signal),
  ]);
  const stations = parseGbfsStations(info, status);
  gbfsCache = { at: Date.now(), stations };
  return stations;
}

async function fromOds(at: LngLat, radiusM: number, signal?: AbortSignal): Promise<BikeStation[]> {
  const where = `within_distance(coordonnees_geo, geom'POINT(${at[0]} ${at[1]})', ${Math.round(radiusM)}m)`;
  const url = `${ODS_URL}?limit=50&where=${encodeURIComponent(where)}`;
  return parseOdsStations(await getJson<{ results?: OdsVelibRecord[] }>(url, signal));
}

/**
 * Nearest Vélib' stations around a point ([] outside the Vélib' area).
 * `need` = "rent" (a bike to take) or "return" (a free dock).
 */
export async function fetchVelibStations(
  at: LngLat,
  { radiusM = 600, limit = 5, need = "any", signal }: { radiusM?: number; limit?: number; need?: BikeNeed; signal?: AbortSignal } = {},
): Promise<BikeStation[]> {
  if (!inVelibArea(at)) return [];
  let stations: BikeStation[];
  try {
    stations = await fromOds(at, radiusM, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    stations = await fromGbfs(signal);
  }
  return nearestStations(stations, at, { radiusM, limit, need });
}
