/**
 * Weekly challenges ("défis de la semaine"): three goals that rotate every
 * Monday, measured on the week's verified trips. Pure and deterministic, so
 * every user gets the same challenges the same week.
 */
import { dayKey, isLowCarbon, isVerified, num, type TripLike } from "@/domain/stats";
import type { TripMode } from "@/types/database";

export interface ChallengeDef {
  id: string;
  icon: string;
  title: string;
  unit: string;
  target: number;
  metric: (trips: TripLike[]) => number;
}

export interface ChallengeState {
  id: string;
  icon: string;
  title: string;
  unit: string;
  target: number;
  value: number;
  progress: number;
  done: boolean;
}

const countMode = (mode: TripMode) => (trips: TripLike[]) => trips.filter((t) => t.mode === mode).length;
const kmMode = (mode: TripMode) => (trips: TripLike[]) => trips.filter((t) => t.mode === mode).reduce((s, t) => s + num(t.distance_km), 0);

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: "bike3", icon: "🚲", title: "3 trajets à vélo", unit: "trajets", target: 3, metric: countMode("bike") },
  { id: "transit5", icon: "🚇", title: "5 trajets en transports", unit: "trajets", target: 5, metric: countMode("publicTransit") },
  { id: "walk5", icon: "🚶", title: "5 km à pied", unit: "km", target: 5, metric: kmMode("walk") },
  {
    id: "green20",
    icon: "🌿",
    title: "20 km sans voiture",
    unit: "km",
    target: 20,
    metric: (t) => t.filter((x) => isLowCarbon(x.mode)).reduce((s, x) => s + num(x.distance_km), 0),
  },
  {
    id: "days4",
    icon: "📅",
    title: "Actif 4 jours différents",
    unit: "jours",
    target: 4,
    metric: (t) => new Set(t.filter((x) => isLowCarbon(x.mode)).map((x) => dayKey(new Date(x.created_at)))).size,
  },
  { id: "co2_5", icon: "☁️", title: "5 kg de CO₂ évités", unit: "kg", target: 5, metric: (t) => t.reduce((s, x) => s + num(x.co2_saved_kg), 0) },
  {
    id: "modes3",
    icon: "🎨",
    title: "3 modes verts différents",
    unit: "modes",
    target: 3,
    metric: (t) => new Set(t.filter((x) => isLowCarbon(x.mode)).map((x) => x.mode)).size,
  },
  {
    id: "early2",
    icon: "🌅",
    title: "2 trajets verts avant 9 h",
    unit: "trajets",
    target: 2,
    metric: (t) => t.filter((x) => isLowCarbon(x.mode) && new Date(x.created_at).getHours() < 9).length,
  },
  {
    id: "weekend1",
    icon: "🏖️",
    title: "1 trajet vert le week-end",
    unit: "trajet",
    target: 1,
    metric: (t) =>
      t.filter((x) => {
        const d = new Date(x.created_at).getDay();
        return isLowCarbon(x.mode) && (d === 0 || d === 6);
      }).length,
  },
];

/** Monday 00:00 (local) of the week containing `d`. */
export function weekStart(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
}

/** Week number since 2024-01-01 (a Monday): drives the rotation. */
export function weekIndex(d: Date): number {
  const ref = new Date(2024, 0, 1).getTime();
  return Math.floor(Math.round((weekStart(d).getTime() - ref) / 86_400_000) / 7);
}

/** The three challenges of the week containing `now`. */
export function challengesOfWeek(now: Date, pool: readonly ChallengeDef[] = CHALLENGES): ChallengeDef[] {
  const n = pool.length;
  const w = weekIndex(now);
  const picks: ChallengeDef[] = [];
  // Step through the pool with a stride coprime to its size → distinct picks.
  const stride = 4;
  for (let i = 0; picks.length < Math.min(3, n); i += 1) {
    const def = pool[(w * 3 + i * stride) % n];
    if (def && !picks.includes(def)) picks.push(def);
  }
  return picks;
}

export function evaluateChallenges(trips: readonly TripLike[], now: Date = new Date()): ChallengeState[] {
  const start = weekStart(now).getTime();
  const end = start + 7 * 86_400_000;
  const week = trips.filter((t) => {
    const at = new Date(t.created_at).getTime();
    return isVerified(t) && at >= start && at < end;
  });
  return challengesOfWeek(now).map((c) => {
    const raw = c.metric(week);
    const value = Math.round(raw * 10) / 10;
    return {
      id: c.id,
      icon: c.icon,
      title: c.title,
      unit: c.unit,
      target: c.target,
      value,
      progress: Math.min(1, value / c.target),
      done: value >= c.target,
    };
  });
}

/** Whole days left before next Monday (1 on Sunday). */
export function daysLeftInWeek(now: Date): number {
  const next = weekStart(now).getTime() + 7 * 86_400_000;
  return Math.max(1, Math.ceil((next - now.getTime()) / 86_400_000));
}
