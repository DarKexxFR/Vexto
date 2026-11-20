/**
 * Vélib' Métropole stations (bike sharing, Paris area) — pure parsing and
 * selection logic. Two open sources, no API key:
 *  - Paris Open Data (OpenDataSoft) "velib-disponibilite-en-temps-reel":
 *    one record per station with availability and coordinates;
 *  - Vélib' Métropole GBFS feeds (station_information + station_status).
 */
import { metersBetween, type LngLat } from "@/domain/navigation";

export interface BikeStation {
  id: string;
  name: string;
  coords: LngLat;
  /** Mechanical + electric bikes ready to rent. */
  bikes: number;
  mechanical: number;
  ebikes: number;
  /** Free docks to return a bike. */
  docks: number;
  capacity: number;
  /** Station installed and renting / accepting returns. */
  renting: boolean;
  returning: boolean;
  /** Metres from the reference point (filled by `nearestStations`). */
  distanceM: number | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** OpenDataSoft booleans come as "OUI"/"NON", true/false or 1/0. */
const yes = (v: unknown, fallback = true): boolean => {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return /^(oui|yes|true|1)$/i.test(String(v).trim());
};

// --- Paris Open Data (OpenDataSoft explore v2.1) ------------------------------------------

export interface OdsVelibRecord {
  stationcode?: string;
  name?: string;
  is_installed?: unknown;
  is_renting?: unknown;
  is_returning?: unknown;
  capacity?: unknown;
  numdocksavailable?: unknown;
  numbikesavailable?: unknown;
  mechanical?: unknown;
  ebike?: unknown;
  coordonnees_geo?: { lon?: number; lat?: number } | null;
}

export function parseOdsStations(json: { results?: OdsVelibRecord[] } | null | undefined): BikeStation[] {
  const out: BikeStation[] = [];
  for (const r of json?.results ?? []) {
    const lon = Number(r.coordonnees_geo?.lon);
    const lat = Number(r.coordonnees_geo?.lat);
    if (!r.stationcode || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const mechanical = num(r.mechanical);
    const ebikes = num(r.ebike);
    const installed = yes(r.is_installed);
    out.push({
      id: String(r.stationcode),
      name: (r.name ?? "Station Vélib'").trim(),
      coords: [lon, lat],
      bikes: num(r.numbikesavailable) || mechanical + ebikes,
      mechanical,
      ebikes,
      docks: num(r.numdocksavailable),
      capacity: num(r.capacity),
      renting: installed && yes(r.is_renting),
      returning: installed && yes(r.is_returning),
      distanceM: null,
    });
  }
  return out;
}

// --- GBFS (Vélib' Métropole) ----------------------------------------------------------------

export interface GbfsInformation {
  data?: { stations?: { station_id?: string | number; stationCode?: string; name?: string; lat?: number; lon?: number; capacity?: number }[] };
}

export interface GbfsStatus {
  data?: {
    stations?: {
      station_id?: string | number;
      num_bikes_available?: number;
      num_bikes_available_types?: Record<string, number>[];
      num_docks_available?: number;
      is_installed?: unknown;
      is_renting?: unknown;
      is_returning?: unknown;
    }[];
  };
}

export function parseGbfsStations(info: GbfsInformation | null | undefined, status: GbfsStatus | null | undefined): BikeStation[] {
  const byId = new Map((status?.data?.stations ?? []).map((s) => [String(s.station_id), s]));
  const out: BikeStation[] = [];
  for (const i of info?.data?.stations ?? []) {
    const s = byId.get(String(i.station_id));
    const lon = Number(i.lon);
    const lat = Number(i.lat);
    if (!s || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const types = Object.assign({}, ...(s.num_bikes_available_types ?? [])) as Record<string, number>;
    const mechanical = num(types.mechanical);
    const ebikes = num(types.ebike);
    const installed = yes(s.is_installed);
    out.push({
      id: String(i.stationCode ?? i.station_id),
      name: (i.name ?? "Station Vélib'").trim(),
      coords: [lon, lat],
      bikes: num(s.num_bikes_available) || mechanical + ebikes,
      mechanical,
      ebikes,
      docks: num(s.num_docks_available),
      capacity: num(i.capacity),
      renting: installed && yes(s.is_renting),
      returning: installed && yes(s.is_returning),
      distanceM: null,
    });
  }
  return out;
}

// --- Selection ------------------------------------------------------------------------------

export type BikeNeed = "rent" | "return" | "any";

/**
 * Closest stations within `radiusM`, nearest first. "rent" keeps stations
 * with a bike to take, "return" those with a free dock.
 */
export function nearestStations(
  stations: BikeStation[],
  at: LngLat,
  { radiusM = 600, limit = 5, need = "any" }: { radiusM?: number; limit?: number; need?: BikeNeed } = {},
): BikeStation[] {
  return stations
    .filter((s) => (need === "rent" ? s.renting && s.bikes > 0 : need === "return" ? s.returning && s.docks > 0 : true))
    .map((s) => ({ ...s, distanceM: metersBetween(at, s.coords) }))
    .filter((s) => (s.distanceM ?? Infinity) <= radiusM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, limit);
}

/** "Plenty" / "few" / "none" for colour coding a count. */
export function availabilityLevel(count: number): "none" | "low" | "ok" {
  if (count <= 0) return "none";
  if (count <= 3) return "low";
  return "ok";
}

/** Vélib' Métropole covers Paris and its neighbouring towns. */
export function inVelibArea([lon, lat]: LngLat): boolean {
  return lon >= 2.0 && lon <= 2.65 && lat >= 48.7 && lat <= 49.0;
}
