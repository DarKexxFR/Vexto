/**
 * Achievements ("succès") unlocked from the verified trip history. Pure and
 * deterministic so the UI can diff before/after a trip to celebrate unlocks.
 */
import {
  isLowCarbon,
  isVerified,
  type StreakInfo,
  type TripLike,
  type TripSummary,
} from "@/domain/stats";

export interface AchievementContext {
  summary: TripSummary;
  streak: StreakInfo;
  trips: readonly TripLike[];
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  target: number;
  /** Unit shown in progress labels, e.g. "km" or "trajets". */
  unit: string;
  metric: (ctx: AchievementContext) => number;
}

function countLowCarbonByHour(
  trips: readonly TripLike[],
  predicate: (hour: number) => boolean,
): number {
  let n = 0;
  for (const t of trips) {
    if (!isVerified(t) || !isLowCarbon(t.mode)) continue;
    if (predicate(new Date(t.created_at).getHours())) n += 1;
  }
  return n;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "first_trip",
    icon: "🌱",
    title: "Premier pas",
    description: "Valider votre premier trajet bas-carbone",
    target: 1,
    unit: "trajet",
    metric: (c) => c.summary.lowCarbonTrips,
  },
  {
    id: "regular",
    icon: "🔁",
    title: "Habitué",
    description: "10 trajets bas-carbone validés",
    target: 10,
    unit: "trajets",
    metric: (c) => c.summary.lowCarbonTrips,
  },
  {
    id: "pillar",
    icon: "🏛️",
    title: "Pilier",
    description: "50 trajets bas-carbone validés",
    target: 50,
    unit: "trajets",
    metric: (c) => c.summary.lowCarbonTrips,
  },
  {
    id: "co2_10",
    icon: "🍃",
    title: "Bouffée d'air",
    description: "10 kg de CO₂ évités",
    target: 10,
    unit: "kg",
    metric: (c) => c.summary.co2Kg,
  },
  {
    id: "co2_100",
    icon: "🌳",
    title: "Poumon vert",
    description: "100 kg de CO₂ évités",
    target: 100,
    unit: "kg",
    metric: (c) => c.summary.co2Kg,
  },
  {
    id: "co2_1t",
    icon: "🌍",
    title: "Une tonne !",
    description: "1 000 kg de CO₂ évités",
    target: 1000,
    unit: "kg",
    metric: (c) => c.summary.co2Kg,
  },
  {
    id: "bike_50",
    icon: "🚲",
    title: "Mollets d'acier",
    description: "50 km parcourus à vélo",
    target: 50,
    unit: "km",
    metric: (c) => c.summary.byMode.bike.km,
  },
  {
    id: "walk_20",
    icon: "🚶",
    title: "Grand marcheur",
    description: "20 km parcourus à pied",
    target: 20,
    unit: "km",
    metric: (c) => c.summary.byMode.walk.km,
  },
  {
    id: "transit_100",
    icon: "🚆",
    title: "As du réseau",
    description: "100 km en transports en commun",
    target: 100,
    unit: "km",
    metric: (c) => c.summary.byMode.publicTransit.km,
  },
  {
    id: "scooter_25",
    icon: "🛴",
    title: "Glisse urbaine",
    description: "25 km en trottinette électrique",
    target: 25,
    unit: "km",
    metric: (c) => c.summary.byMode.eScooter.km,
  },
  {
    id: "streak_3",
    icon: "🔥",
    title: "Sur la lancée",
    description: "3 jours d'affilée avec un trajet vert",
    target: 3,
    unit: "jours",
    metric: (c) => c.streak.best,
  },
  {
    id: "streak_7",
    icon: "☄️",
    title: "Semaine parfaite",
    description: "7 jours d'affilée avec un trajet vert",
    target: 7,
    unit: "jours",
    metric: (c) => c.streak.best,
  },
  {
    id: "explorer",
    icon: "🧭",
    title: "Touche-à-tout",
    description: "Utiliser les 4 modes bas-carbone",
    target: 4,
    unit: "modes",
    metric: (c) => c.summary.modesUsed,
  },
  {
    id: "long_haul",
    icon: "🏁",
    title: "Longue distance",
    description: "Un trajet vert de 20 km ou plus",
    target: 20,
    unit: "km",
    metric: (c) => c.summary.longestTripKm,
  },
  {
    id: "early_bird",
    icon: "🌅",
    title: "Lève-tôt",
    description: "Un trajet vert terminé avant 7 h",
    target: 1,
    unit: "trajet",
    metric: (c) => countLowCarbonByHour(c.trips, (h) => h < 7),
  },
  {
    id: "night_owl",
    icon: "🦉",
    title: "Oiseau de nuit",
    description: "Un trajet vert terminé après 22 h",
    target: 1,
    unit: "trajet",
    metric: (c) => countLowCarbonByHour(c.trips, (h) => h >= 22),
  },
];

export interface AchievementState extends AchievementDef {
  current: number;
  progress: number;
  unlocked: boolean;
}

export function evaluateAchievements(ctx: AchievementContext): AchievementState[] {
  return ACHIEVEMENTS.map((def) => {
    const current = Math.max(0, def.metric(ctx));
    return {
      ...def,
      current,
      progress: Math.min(1, current / def.target),
      unlocked: current >= def.target,
    };
  });
}

/** Achievements unlocked in `after` but not in `before`. */
export function newlyUnlocked(
  before: readonly AchievementState[],
  after: readonly AchievementState[],
): AchievementState[] {
  const was = new Set(before.filter((a) => a.unlocked).map((a) => a.id));
  return after.filter((a) => a.unlocked && !was.has(a.id));
}
