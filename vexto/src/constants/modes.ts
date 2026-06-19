import type { TripMode } from "@/types/database";

export interface ModeMeta {
  mode: TripMode;
  label: string;
  icon: string; // emoji placeholder; swap for vector icons later
  /** Rough average speed (km/h) to estimate trip duration. */
  speedKmh: number;
  /** Whether this mode requires PostGIS anti-cheat validation. */
  requiresGeoCheck: boolean;
}

export const MODES: Record<TripMode, ModeMeta> = {
  carThermal: {
    mode: "carThermal",
    label: "Voiture",
    icon: "🚗",
    speedKmh: 22,
    requiresGeoCheck: false,
  },
  publicTransit: {
    mode: "publicTransit",
    label: "Transport en commun",
    icon: "🚆",
    speedKmh: 28,
    requiresGeoCheck: true,
  },
  bike: {
    mode: "bike",
    label: "Vélo",
    icon: "🚲",
    speedKmh: 15,
    requiresGeoCheck: false,
  },
  eScooter: {
    mode: "eScooter",
    label: "Trottinette électrique",
    icon: "🛴",
    speedKmh: 18,
    requiresGeoCheck: false,
  },
  walk: {
    mode: "walk",
    label: "Marche",
    icon: "🚶",
    speedKmh: 4.8,
    requiresGeoCheck: false,
  },
};

/** Modes offered as low-carbon alternatives (everything but the car baseline). */
export const ALTERNATIVE_MODES: TripMode[] = [
  "publicTransit",
  "bike",
  "eScooter",
  "walk",
];

/** All selectable modes for routing/navigation, car first (the baseline). */
export const ROUTE_MODES: TripMode[] = [
  "carThermal",
  "publicTransit",
  "bike",
  "eScooter",
  "walk",
];

export function estimateMinutes(mode: TripMode, distanceKm: number): number {
  const meta = MODES[mode];
  return Math.max(1, Math.round((distanceKm / meta.speedKmh) * 60));
}
