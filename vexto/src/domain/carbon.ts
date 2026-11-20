/**
 * Core carbon-footprint & gamification logic for Vexto.
 *
 * All emission factors come from official ADEME values (kg CO2e per km).
 * This module is pure (no I/O) so it can be unit-tested and reused on the
 * client and inside Edge Functions without modification.
 */

/** ADEME emission factors, expressed in kg CO2e per kilometre. */
export const EMISSION_FACTORS = {
  /** Voiture thermique individuelle (autosolisme). */
  carThermal: 0.218,
  /** Transports collectifs (mix RATP/TER/bus urbains). */
  publicTransit: 0.01,
  /** Vélo / vélo électrique (cycle de vie négligeable côté usage). */
  bike: 0.0,
  /** Trottinette électrique (ordre de grandeur ADEME). */
  eScooter: 0.025,
  /** Marche à pied. */
  walk: 0.0,
} as const;

export type TransportMode = keyof typeof EMISSION_FACTORS;

/**
 * Net emission factor saved when switching from the car baseline to
 * collective transit: ΔFE = 0.218 - 0.010 = 0.208 kg CO2e/km.
 */
export const NET_SAVING_FACTOR_TRANSIT =
  EMISSION_FACTORS.carThermal - EMISSION_FACTORS.publicTransit; // 0.208

/**
 * Points attribution rule: 1 point = 100 g (0.1 kg) of CO2e saved.
 * => points = savedKg / 0.1 = savedKg * 10.
 * For the canonical car→transit case this yields distance * 2.08.
 */
export const GRAMS_PER_POINT = 100;
export const KG_PER_POINT = GRAMS_PER_POINT / 1000; // 0.1
export const POINTS_PER_KG = 1 / KG_PER_POINT; // 10

/** Reference baseline: every trip is compared against driving a car. */
export const BASELINE_MODE: TransportMode = "carThermal";

/** kg CO2e emitted by `mode` over `distanceKm`. Negative distance is clamped. */
export function emissionsForMode(mode: TransportMode, distanceKm: number): number {
  const km = Math.max(0, distanceKm);
  return EMISSION_FACTORS[mode] * km;
}

/**
 * CO2e saved (kg) by taking `mode` instead of the car baseline.
 * Never negative — a more-polluting choice than the baseline yields 0.
 */
export function co2SavedKg(
  mode: TransportMode,
  distanceKm: number,
  baseline: TransportMode = BASELINE_MODE,
): number {
  const baselineEmissions = emissionsForMode(baseline, distanceKm);
  const modeEmissions = emissionsForMode(mode, distanceKm);
  return Math.max(0, baselineEmissions - modeEmissions);
}

/** Convert kg of CO2e saved into Vexto points (rounded to nearest int). */
export function pointsFromSavedKg(savedKg: number): number {
  return Math.round(Math.max(0, savedKg) * POINTS_PER_KG);
}

/** Points gained for a trip of `distanceKm` using `mode` vs the car baseline. */
export function pointsForTrip(
  mode: TransportMode,
  distanceKm: number,
  baseline: TransportMode = BASELINE_MODE,
): number {
  return pointsFromSavedKg(co2SavedKg(mode, distanceKm, baseline));
}

export interface ModeOutcome {
  mode: TransportMode;
  distanceKm: number;
  emissionsKg: number;
  co2SavedKg: number;
  points: number;
}

/** Full breakdown for a single mode/distance — handy for trip comparison UIs. */
export function evaluateMode(
  mode: TransportMode,
  distanceKm: number,
  baseline: TransportMode = BASELINE_MODE,
): ModeOutcome {
  const saved = co2SavedKg(mode, distanceKm, baseline);
  return {
    mode,
    distanceKm: Math.max(0, distanceKm),
    emissionsKg: emissionsForMode(mode, distanceKm),
    co2SavedKg: saved,
    points: pointsFromSavedKg(saved),
  };
}
