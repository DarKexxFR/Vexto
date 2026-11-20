/**
 * Turns raw routes (one per routing profile) into comparable transport options:
 * real distance & duration per mode, CO₂/points, feasibility, and smart tags
 * (fastest / greenest / recommended), optionally weather- and equipment-aware.
 */
import { evaluateMode } from "@/domain/carbon";
import type { GeoLineString, TripMode } from "@/types/database";

/** Routing profiles requested from the Directions API. */
export type RoutingProfile = "driving-traffic" | "cycling" | "walking";

export const ROUTING_PROFILES: readonly RoutingProfile[] = [
  "driving-traffic",
  "cycling",
  "walking",
];

export interface VoiceInstruction {
  /** Announce when the distance left in the step drops below this (metres). */
  distanceAlongM: number;
  announcement: string;
}

export interface RouteStep {
  instruction: string;
  maneuverType: string;
  modifier: string | null;
  /** Road name after the maneuver (may be empty). */
  name: string;
  /** Length of the step, from its maneuver to the next one (metres). */
  distanceM: number;
  durationS: number;
  /** Maneuver location [lon, lat]. */
  location: [number, number];
  voice: VoiceInstruction[];
  /** Roundabout exit number, when relevant. */
  exit: number | null;
}

export interface RoutedPath {
  profile: RoutingProfile;
  distanceKm: number;
  durationMin: number;
  geometry: GeoLineString;
  steps: RouteStep[];
}

export type RoutesByProfile = Partial<Record<RoutingProfile, RoutedPath>>;

export function profileForMode(mode: TripMode): RoutingProfile {
  switch (mode) {
    case "walk":
      return "walking";
    case "bike":
    case "eScooter":
      return "cycling";
    case "carThermal":
    case "publicTransit":
    default:
      // No transit routing in the Directions API: the road route is used as
      // the distance baseline until GTFS routing is wired in.
      return "driving-traffic";
  }
}

/**
 * Door-to-door public transit estimate: ~8 min to walk to the stop and wait,
 * then a commercial speed that rises smoothly from bus/metro (~16 km/h) to
 * suburban rail (~40 km/h) as the trip gets longer.
 */
export function transitDurationMin(km: number): number {
  const d = Math.max(0, km);
  const speedKmh = 16 + 24 * (1 - Math.exp(-d / 15));
  return 8 + (d / speedKmh) * 60;
}

const FALLBACK_SPEED_KMH: Record<TripMode, number> = {
  carThermal: 25,
  publicTransit: 22,
  bike: 15,
  eScooter: 18,
  walk: 4.8,
};

/** Above `long` the option is tiring; above `max` it is not proposed. */
const DISTANCE_LIMITS_KM: Record<TripMode, { long: number; max: number }> = {
  carThermal: { long: Infinity, max: Infinity },
  publicTransit: { long: Infinity, max: Infinity },
  bike: { long: 20, max: 60 },
  eScooter: { long: 12, max: 30 },
  walk: { long: 5, max: 15 },
};

export type Feasibility = "ok" | "long" | "unrealistic";
export type ModeTag = "fastest" | "greenest" | "recommended";

export interface ModeOption {
  mode: TripMode;
  distanceKm: number;
  durationMin: number;
  /** True when the duration is an estimate rather than a routed value. */
  durationEstimated: boolean;
  emissionsKg: number;
  co2SavedKg: number;
  points: number;
  /** Path to draw / navigate (null when unavailable). */
  path: RoutedPath | null;
  feasibility: Feasibility;
  tags: ModeTag[];
  note: string | null;
}

export interface PlanContext {
  /** Weather that makes walking/cycling unpleasant or unsafe. */
  weather?: { badForSoftModes: boolean; reason: string | null } | null;
  /** Personal equipment (undefined = unknown, treated as owned). */
  owned?: Partial<Record<"bike" | "eScooter", boolean>>;
  /**
   * Real public transport itinerary (IDFM PRIM): door-to-door minutes from
   * now (waiting included), distance and a short summary ("RER A à 08:42").
   */
  transit?: { durationMin: number; distanceKm: number; summary: string; path: RoutedPath | null } | null;
}

export function feasibilityFor(mode: TripMode, km: number): Feasibility {
  const limits = DISTANCE_LIMITS_KM[mode];
  if (km > limits.max) return "unrealistic";
  if (km > limits.long) return "long";
  return "ok";
}

const SOFT_MODES: readonly TripMode[] = ["bike", "eScooter", "walk"];

export function buildModeOptions(
  routes: RoutesByProfile,
  ctx: PlanContext = {},
): ModeOption[] {
  const drive = routes["driving-traffic"];
  const cycle = routes.cycling;
  const foot = routes.walking;
  const baseKm = drive?.distanceKm ?? cycle?.distanceKm ?? foot?.distanceKm;
  if (baseKm == null) return [];

  const make = (
    mode: TripMode,
    path: RoutedPath | null,
    distanceKm: number,
    durationMin: number,
    durationEstimated: boolean,
  ): ModeOption => {
    const outcome = evaluateMode(mode, distanceKm);
    return {
      mode,
      distanceKm,
      durationMin,
      durationEstimated,
      emissionsKg: outcome.emissionsKg,
      co2SavedKg: outcome.co2SavedKg,
      points: outcome.points,
      path,
      feasibility: feasibilityFor(mode, distanceKm),
      tags: [],
      note: null,
    };
  };

  const fallback = (mode: TripMode, km: number) => (km / FALLBACK_SPEED_KMH[mode]) * 60;

  const options: ModeOption[] = [
    drive
      ? make("carThermal", drive, drive.distanceKm, drive.durationMin, false)
      : make("carThermal", null, baseKm, fallback("carThermal", baseKm), true),
    ctx.transit
      ? make("publicTransit", ctx.transit.path ?? drive ?? null, ctx.transit.distanceKm, ctx.transit.durationMin, false)
      : make("publicTransit", drive ?? null, baseKm, transitDurationMin(baseKm), true),
    cycle
      ? make("bike", cycle, cycle.distanceKm, cycle.durationMin, false)
      : make("bike", null, baseKm, fallback("bike", baseKm), true),
    cycle
      ? make("eScooter", cycle, cycle.distanceKm, cycle.durationMin * 0.85, false)
      : make("eScooter", null, baseKm, fallback("eScooter", baseKm), true),
    foot
      ? make("walk", foot, foot.distanceKm, foot.durationMin, false)
      : make("walk", null, baseKm, fallback("walk", baseKm), true),
  ];

  const badWeather = ctx.weather?.badForSoftModes === true;

  // Notes ---------------------------------------------------------------------
  for (const o of options) {
    const notes: string[] = [];
    if (o.mode === "carThermal") notes.push("Référence : 0 point");
    if (o.mode === "publicTransit") {
      if (ctx.transit) notes.push(ctx.transit.summary);
      else notes.push(o.distanceKm < 1 ? "Trajet court : la marche est souvent aussi rapide" : "Durée estimée, attente comprise");
    }
    if (o.feasibility === "unrealistic") {
      notes.push(o.mode === "walk" ? "Trop long à pied" : "Distance trop longue pour ce mode");
    } else if (o.feasibility === "long") {
      notes.push(o.mode === "walk" ? "Belle balade : prévoyez de bonnes chaussures" : "Trajet sportif");
    }
    if ((o.mode === "bike" || o.mode === "eScooter") && ctx.owned?.[o.mode] === false) {
      notes.push("Pensez au libre-service");
    }
    if (badWeather && SOFT_MODES.includes(o.mode) && ctx.weather?.reason) {
      notes.push(ctx.weather.reason);
    }
    o.note = notes.length > 0 ? notes.join(" · ") : null;
  }

  // Tags ----------------------------------------------------------------------
  const realistic = options.filter((o) => o.feasibility !== "unrealistic");

  const fastest = realistic.reduce<ModeOption | null>(
    (best, o) => (!best || o.durationMin < best.durationMin ? o : best),
    null,
  );
  fastest?.tags.push("fastest");

  // Greenest = lowest absolute emissions (not the biggest "saving", which would
  // favour whichever route happens to be longer). Ties → the quicker one.
  const greenest = realistic.reduce<ModeOption | null>((best, o) => {
    if (!best) return o;
    if (o.emissionsKg < best.emissionsKg - 1e-9) return o;
    if (Math.abs(o.emissionsKg - best.emissionsKg) <= 1e-9 && o.durationMin < best.durationMin) return o;
    return best;
  }, null);
  if (greenest && greenest.mode !== "carThermal") greenest.tags.push("greenest");

  // Recommended: the quickest realistic low-carbon option, after penalising
  // soft modes in bad weather and modes needing a shared vehicle.
  const penalty = (o: ModeOption): number => {
    let p = 0;
    if (badWeather && SOFT_MODES.includes(o.mode)) p += 25;
    if ((o.mode === "bike" || o.mode === "eScooter") && ctx.owned?.[o.mode] === false) p += 5;
    if (o.feasibility === "long") p += 10;
    return p;
  };
  const recommended = realistic
    .filter((o) => o.mode !== "carThermal")
    .reduce<ModeOption | null>((best, o) => {
      if (!best) return o;
      const a = o.durationMin + penalty(o);
      const b = best.durationMin + penalty(best);
      if (a < b - 1e-9) return o;
      if (Math.abs(a - b) <= 1e-9 && o.co2SavedKg > best.co2SavedKg) return o;
      return best;
    }, null);
  recommended?.tags.push("recommended");

  // Order: recommended, other realistic low-carbon options by time, unrealistic
  // ones, then the car baseline.
  const rank = (o: ModeOption): number => {
    if (o.tags.includes("recommended")) return 0;
    if (o.mode === "carThermal") return 3;
    if (o.feasibility === "unrealistic") return 2;
    return 1;
  };
  return [...options].sort((a, b) => rank(a) - rank(b) || a.durationMin - b.durationMin);
}

export function recommendedOption(options: readonly ModeOption[]): ModeOption | null {
  return options.find((o) => o.tags.includes("recommended")) ?? null;
}
