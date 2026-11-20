/**
 * Île-de-France public transport (RATP, SNCF Transilien/RER, Optile buses…)
 * through IDFM's PRIM platform, which exposes the Navitia API. This module
 * turns raw Navitia JSON into small app-friendly shapes. Pure and unit-tested.
 *
 * Navitia reference: https://doc.navitia.io (journeys, departures,
 * places_nearby, pt_objects, lines).
 */
import { cumulativeDistances, metersBetween, projectOnLine, type LngLat } from "@/domain/navigation";

// --- Raw Navitia shapes (only the fields we use) -----------------------------------

interface NvCoord {
  lon: string | number;
  lat: string | number;
}

interface NvLink {
  type?: string;
  id?: string;
}

export interface NvDisplayInformations {
  commercial_mode?: string;
  physical_mode?: string;
  network?: string;
  code?: string;
  label?: string;
  color?: string;
  text_color?: string;
  direction?: string;
  headsign?: string;
  name?: string;
  links?: NvLink[];
}

interface NvNamed {
  id?: string;
  name?: string;
  coord?: NvCoord;
}

interface NvPlace {
  id?: string;
  name?: string;
  embedded_type?: string;
  distance?: string | number;
  stop_point?: NvNamed;
  stop_area?: NvNamed;
  address?: NvNamed;
  poi?: NvNamed;
}

interface NvSection {
  type?: string;
  mode?: string;
  duration?: number;
  departure_date_time?: string;
  arrival_date_time?: string;
  base_departure_date_time?: string;
  base_arrival_date_time?: string;
  data_freshness?: string;
  from?: NvPlace;
  to?: NvPlace;
  geojson?: { type?: string; coordinates?: number[][] };
  display_informations?: NvDisplayInformations;
  stop_date_times?: unknown[];
}

interface NvJourney {
  duration?: number;
  nb_transfers?: number;
  departure_date_time?: string;
  arrival_date_time?: string;
  type?: string;
  status?: string;
  co2_emission?: { value?: number; unit?: string };
  durations?: { walking?: number };
  sections?: NvSection[];
}

export interface NvJourneysResponse {
  journeys?: NvJourney[];
  error?: { id?: string; message?: string };
}

export interface NvDeparturesResponse {
  departures?: Array<{
    display_informations?: NvDisplayInformations;
    stop_point?: NvNamed;
    route?: { id?: string; name?: string; line?: { id?: string }; direction?: NvPlace };
    stop_date_time?: {
      departure_date_time?: string;
      base_departure_date_time?: string;
      data_freshness?: string;
    };
  }>;
}

export interface NvPlacesNearbyResponse {
  places_nearby?: NvPlace[];
}

interface NvLine {
  id?: string;
  name?: string;
  code?: string;
  color?: string;
  text_color?: string;
  commercial_mode?: { id?: string; name?: string };
  physical_modes?: Array<{ id?: string; name?: string }>;
  network?: { id?: string; name?: string };
  opening_time?: string;
  closing_time?: string;
  geojson?: { type?: string; coordinates?: unknown };
}

export interface NvPtObjectsResponse {
  pt_objects?: Array<{
    id?: string;
    name?: string;
    embedded_type?: string;
    line?: NvLine;
    stop_area?: NvNamed;
  }>;
}

export interface NvLineResponse {
  lines?: NvLine[];
}

export interface NvStopAreasResponse {
  stop_areas?: NvNamed[];
}

// --- App shapes -------------------------------------------------------------------------

export type TransitModeKind = "rer" | "metro" | "tram" | "train" | "bus" | "cable" | "other";

export interface LineBadge {
  id: string | null;
  kind: TransitModeKind;
  /** Commercial mode label, e.g. "RER", "Métro", "Bus". */
  modeLabel: string;
  /** Short code shown in the pill, e.g. "A", "1", "38", "T3a". */
  code: string;
  color: string;
  textColor: string;
  network: string;
}

export type LegType = "walk" | "transit" | "transfer" | "wait";

export interface TransitLeg {
  type: LegType;
  from: string;
  to: string;
  fromCoords: LngLat | null;
  toCoords: LngLat | null;
  departure: Date | null;
  arrival: Date | null;
  durationMin: number;
  line: LineBadge | null;
  direction: string | null;
  /** Number of stops ridden (transit legs). */
  stops: number;
  geometry: LngLat[];
  realtime: boolean;
  /** Positive = late, in minutes (realtime only). */
  delayMin: number;
}

export interface TransitJourney {
  id: string;
  departure: Date;
  arrival: Date;
  durationMin: number;
  transfers: number;
  walkingMin: number;
  legs: TransitLeg[];
  distanceKm: number;
  /** Navitia's own estimate for the journey (grams CO₂e), when provided. */
  co2Grams: number | null;
  /** Non-empty when Navitia flags disruptions (e.g. "SIGNIFICANT_DELAYS"). */
  status: string | null;
}

export interface DepartureTime {
  at: Date;
  realtime: boolean;
  delayMin: number;
}

export interface DepartureGroup {
  key: string;
  line: LineBadge;
  direction: string;
  times: DepartureTime[];
}

export interface StopAreaSummary {
  id: string;
  name: string;
  coords: LngLat | null;
  distanceM: number | null;
}

export type TransitSearchResult =
  | { kind: "line"; id: string; badge: LineBadge; name: string }
  | { kind: "stop"; id: string; name: string; coords: LngLat | null };

export interface LineDetail {
  badge: LineBadge;
  name: string;
  /** One polyline per branch / direction. */
  shape: LngLat[][];
  /** Stops ordered along the main branch. */
  stops: StopAreaSummary[];
  openingTime: string | null;
  closingTime: string | null;
}

// --- Helpers ---------------------------------------------------------------------------------

/** Navitia local datetime "20261120T083600" → Date (device local time). */
export function parseNavitiaDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** Date → Navitia local datetime string. */
export function toNavitiaDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function coordOf(c: NvCoord | undefined): LngLat | null {
  if (!c) return null;
  const lon = Number(c.lon);
  const lat = Number(c.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) && (lon !== 0 || lat !== 0) ? [lon, lat] : null;
}

function placeCoords(p: NvPlace | undefined): LngLat | null {
  return coordOf(p?.stop_point?.coord ?? p?.stop_area?.coord ?? p?.address?.coord ?? p?.poi?.coord);
}

function placeName(p: NvPlace | undefined): string {
  const raw = p?.stop_point?.name ?? p?.stop_area?.name ?? p?.name ?? "";
  return cleanName(raw);
}

/** "Châtelet (Paris)" → "Châtelet"; keeps names without a trailing city as-is. */
export function cleanName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name.trim();
}

function hex(color: string | undefined, fallback: string): string {
  const c = (color ?? "").replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(c) ? `#${c.toUpperCase()}` : fallback;
}

export function modeKind(label: string | undefined): TransitModeKind {
  const l = (label ?? "").toLowerCase();
  if (/\brer\b/.test(l)) return "rer";
  if (/m[ée]tro|metro/.test(l)) return "metro";
  if (/tram/.test(l)) return "tram";
  if (/transilien|train|ter\b|tgv|intercit/.test(l)) return "train";
  if (/c[aâ]ble|funiculaire|t[ée]l[ée]ph[ée]rique/.test(l)) return "cable";
  if (/bus|noctilien|navette|car\b/.test(l)) return "bus";
  return "other";
}

const KIND_RANK: Record<TransitModeKind, number> = { rer: 0, metro: 1, train: 2, tram: 3, cable: 4, bus: 5, other: 6 };

const DEFAULT_COLORS: Record<TransitModeKind, string> = {
  rer: "#2F6FDE",
  metro: "#102B19",
  train: "#7A5AF8",
  tram: "#2A804D",
  cable: "#D98B1F",
  bus: "#5E6B64",
  other: "#5E6B64",
};

function lineIdFromLinks(links: NvLink[] | undefined): string | null {
  return links?.find((l) => l.type === "line")?.id ?? null;
}

export function badgeFromDisplay(d: NvDisplayInformations | undefined, lineId?: string | null): LineBadge {
  const modeLabel = d?.commercial_mode ?? d?.physical_mode ?? "";
  const kind = modeKind(modeLabel || d?.network);
  return {
    id: lineId ?? lineIdFromLinks(d?.links),
    kind,
    modeLabel: modeLabel || "Ligne",
    code: (d?.code || d?.label || d?.name || "?").trim(),
    color: hex(d?.color, DEFAULT_COLORS[kind]),
    textColor: hex(d?.text_color, "#FFFFFF"),
    network: d?.network ?? "",
  };
}

function badgeFromLine(l: NvLine): LineBadge {
  const modeLabel = l.commercial_mode?.name ?? l.physical_modes?.[0]?.name ?? "";
  const kind = modeKind(modeLabel || l.network?.name);
  return {
    id: l.id ?? null,
    kind,
    modeLabel: modeLabel || "Ligne",
    code: (l.code || l.name || "?").trim(),
    color: hex(l.color, DEFAULT_COLORS[kind]),
    textColor: hex(l.text_color, "#FFFFFF"),
    network: l.network?.name ?? "",
  };
}

function toLngLats(coords: number[][] | undefined): LngLat[] {
  const out: LngLat[] = [];
  for (const c of coords ?? []) {
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) out.push([lon, lat]);
  }
  return out;
}

function lengthKm(line: LngLat[]): number {
  const cum = cumulativeDistances(line);
  return (cum[cum.length - 1] ?? 0) / 1000;
}

function minutesBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

// --- Parsers ---------------------------------------------------------------------------------

export function parseJourneys(json: NvJourneysResponse): TransitJourney[] {
  const journeys: TransitJourney[] = [];
  (json.journeys ?? []).forEach((j, index) => {
    const departure = parseNavitiaDate(j.departure_date_time);
    const arrival = parseNavitiaDate(j.arrival_date_time);
    if (!departure || !arrival) return;

    const legs: TransitLeg[] = [];
    for (const s of j.sections ?? []) {
      const type = s.type ?? "";
      const dep = parseNavitiaDate(s.departure_date_time);
      const arr = parseNavitiaDate(s.arrival_date_time);
      const geometry = toLngLats(s.geojson?.coordinates);
      const durationMin = s.duration != null ? Math.round(s.duration / 60) : minutesBetween(dep, arr);
      const base = {
        from: placeName(s.from),
        to: placeName(s.to),
        fromCoords: placeCoords(s.from),
        toCoords: placeCoords(s.to),
        departure: dep,
        arrival: arr,
        durationMin,
        line: null,
        direction: null,
        stops: 0,
        geometry,
        realtime: false,
        delayMin: 0,
      };
      if (type === "public_transport" || type === "on_demand_transport") {
        const baseDep = parseNavitiaDate(s.base_departure_date_time);
        const realtime = s.data_freshness === "realtime";
        legs.push({
          ...base,
          type: "transit",
          line: badgeFromDisplay(s.display_informations),
          direction: s.display_informations?.direction ? cleanName(s.display_informations.direction) : null,
          stops: Math.max(1, (s.stop_date_times?.length ?? 2) - 1),
          realtime,
          delayMin: realtime && baseDep && dep ? Math.round((dep.getTime() - baseDep.getTime()) / 60_000) : 0,
        });
      } else if (type === "street_network" || type === "crow_fly") {
        if (durationMin <= 0 && geometry.length < 2) continue;
        legs.push({ ...base, type: "walk" });
      } else if (type === "transfer") {
        legs.push({ ...base, type: "transfer" });
      } else if (type === "waiting") {
        legs.push({ ...base, type: "wait" });
      }
    }

    const distanceKm = legs.reduce((sum, l) => sum + (l.geometry.length > 1 ? lengthKm(l.geometry) : 0), 0);
    journeys.push({
      id: `${toNavitiaDate(departure)}-${index}`,
      departure,
      arrival,
      durationMin: j.duration != null ? Math.round(j.duration / 60) : minutesBetween(departure, arrival),
      transfers: j.nb_transfers ?? Math.max(0, legs.filter((l) => l.type === "transit").length - 1),
      walkingMin: Math.round((j.durations?.walking ?? 0) / 60),
      legs,
      distanceKm,
      co2Grams: typeof j.co2_emission?.value === "number" ? j.co2_emission.value : null,
      status: j.status ? j.status : null,
    });
  });
  // Walking-only answers belong to the "Marche" option, not to transit. The
  // journey that gets you there first comes first (then the shortest one), so
  // the default selection is the fastest way by public transport.
  return journeys
    .filter((j) => j.legs.some((l) => l.type === "transit"))
    .sort(
      (a, b) =>
        a.arrival.getTime() - b.arrival.getTime() ||
        a.durationMin - b.durationMin ||
        a.departure.getTime() - b.departure.getTime(),
    );
}

function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
}

export function parseDepartures(json: NvDeparturesResponse, now: Date = new Date(), perGroup = 4): DepartureGroup[] {
  const groups = new Map<string, DepartureGroup>();
  for (const d of json.departures ?? []) {
    const at = parseNavitiaDate(d.stop_date_time?.departure_date_time);
    if (!at || at.getTime() < now.getTime() - 60_000) continue;
    const lineId = d.route?.line?.id ?? lineIdFromLinks(d.display_informations?.links);
    const line = badgeFromDisplay(d.display_informations, lineId);
    const direction = cleanName(d.display_informations?.direction ?? d.route?.direction?.name ?? d.route?.name ?? "");
    const key = `${line.id ?? `${line.kind}-${line.code}`}|${direction}`;
    const base = parseNavitiaDate(d.stop_date_time?.base_departure_date_time);
    const realtime = d.stop_date_time?.data_freshness === "realtime";
    const group = groups.get(key) ?? { key, line, direction, times: [] };
    group.times.push({
      at,
      realtime,
      delayMin: realtime && base ? Math.round((at.getTime() - base.getTime()) / 60_000) : 0,
    });
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const g of list) {
    g.times.sort((a, b) => a.at.getTime() - b.at.getTime());
    g.times = g.times.slice(0, perGroup);
  }
  return list.sort(
    (a, b) =>
      KIND_RANK[a.line.kind] - KIND_RANK[b.line.kind] ||
      compareCodes(a.line.code, b.line.code) ||
      (a.times[0]?.at.getTime() ?? 0) - (b.times[0]?.at.getTime() ?? 0),
  );
}

export function parseNearby(json: NvPlacesNearbyResponse): StopAreaSummary[] {
  const out: StopAreaSummary[] = [];
  for (const p of json.places_nearby ?? []) {
    if (p.embedded_type !== "stop_area") continue;
    const id = p.stop_area?.id ?? p.id;
    if (!id) continue;
    const distance = Number(p.distance);
    out.push({
      id,
      name: cleanName(p.stop_area?.name ?? p.name ?? ""),
      coords: coordOf(p.stop_area?.coord),
      distanceM: Number.isFinite(distance) ? distance : null,
    });
  }
  return out.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
}

export function parseSearch(json: NvPtObjectsResponse): TransitSearchResult[] {
  const out: TransitSearchResult[] = [];
  for (const o of json.pt_objects ?? []) {
    if (o.embedded_type === "line" && o.line?.id) {
      const badge = badgeFromLine(o.line);
      out.push({ kind: "line", id: o.line.id, badge, name: o.line.name ?? o.name ?? badge.code });
    } else if (o.embedded_type === "stop_area" && (o.stop_area?.id ?? o.id)) {
      out.push({
        kind: "stop",
        id: (o.stop_area?.id ?? o.id) as string,
        name: cleanName(o.stop_area?.name ?? o.name ?? ""),
        coords: coordOf(o.stop_area?.coord),
      });
    }
  }
  return out;
}

function hhmm(value: string | undefined): string | null {
  const m = /^(\d{2})(\d{2})/.exec(value ?? "");
  return m ? `${m[1]}:${m[2]}` : null;
}

function shapeOf(geojson: NvLine["geojson"]): LngLat[][] {
  if (!geojson?.coordinates) return [];
  if (geojson.type === "LineString") return [toLngLats(geojson.coordinates as number[][])];
  if (geojson.type === "MultiLineString") {
    return (geojson.coordinates as number[][][]).map((part) => toLngLats(part)).filter((p) => p.length > 1);
  }
  return [];
}

/** Order stops along the longest branch of the line (Navitia returns them unordered). */
export function orderStopsAlongShape(stops: StopAreaSummary[], shape: LngLat[][]): StopAreaSummary[] {
  const trunk = shape.reduce<LngLat[]>((best, part) => (part.length > best.length ? part : best), []);
  if (trunk.length < 2) return [...stops].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const cum = cumulativeDistances(trunk);
  const keyed = stops.map((s) => ({ s, along: s.coords ? (projectOnLine(s.coords, trunk, cum)?.alongM ?? Infinity) : Infinity }));
  return keyed.sort((a, b) => a.along - b.along).map((k) => k.s);
}

export function parseLine(lineJson: NvLineResponse, stopsJson: NvStopAreasResponse): LineDetail | null {
  const line = lineJson.lines?.[0];
  if (!line) return null;
  const shape = shapeOf(line.geojson);
  const stops: StopAreaSummary[] = (stopsJson.stop_areas ?? [])
    .filter((s): s is NvNamed & { id: string } => Boolean(s.id))
    .map((s) => ({ id: s.id, name: cleanName(s.name ?? ""), coords: coordOf(s.coord), distanceM: null }));
  return {
    badge: badgeFromLine(line),
    name: line.name ?? line.code ?? "",
    shape,
    stops: orderStopsAlongShape(stops, shape),
    openingTime: hhmm(line.opening_time),
    closingTime: hhmm(line.closing_time),
  };
}

// --- Presentation helpers ------------------------------------------------------------------

export function minutesUntil(at: Date, now: Date = new Date()): number {
  return Math.floor((at.getTime() - now.getTime()) / 60_000);
}

/** "à l'approche", "3 min", or "14:05" when more than an hour away. */
export function formatWait(at: Date, now: Date = new Date()): string {
  const m = minutesUntil(at, now);
  if (m <= 0) return "à l'approche";
  if (m < 60) return `${m} min`;
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function transitLegs(j: TransitJourney): TransitLeg[] {
  return j.legs.filter((l) => l.type === "transit");
}

/** Human summary of a leg for banners and voice ("Prenez le RER A direction …"). */
export function legInstruction(leg: TransitLeg): string {
  if (leg.type === "transit" && leg.line) {
    const what = leg.line.kind === "bus" ? `le bus ${leg.line.code}` : `le ${leg.line.modeLabel} ${leg.line.code}`;
    return `Prenez ${what}${leg.direction ? ` direction ${leg.direction}` : ""} à ${leg.from}`;
  }
  if (leg.type === "transfer") return `Correspondance à ${leg.from}`;
  if (leg.type === "wait") return `Patientez à ${leg.from}`;
  return `Marchez jusqu'à ${leg.to || "votre destination"}`;
}

/** Walking distance in metres between two points, for "à 350 m" labels. */
export function walkingDistanceM(a: LngLat, b: LngLat): number {
  return metersBetween(a, b);
}
