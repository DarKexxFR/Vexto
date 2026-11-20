/**
 * Pure statistics over the user's trip history: totals, per-mode breakdown,
 * daily series for charts, rolling week comparison and streaks.
 * Only `verified` trips count toward progress (they passed server checks).
 */
import type { TripMode, TripStatus } from "@/types/database";

/** The subset of a trip row the statistics need (keeps tests lightweight). */
export interface TripLike {
  mode: TripMode;
  distance_km: number | string;
  co2_saved_kg: number | string;
  points_awarded: number | string;
  status: TripStatus;
  created_at: string;
}

export const LOW_CARBON_MODES: readonly TripMode[] = [
  "publicTransit",
  "bike",
  "eScooter",
  "walk",
];

export const ALL_MODES: readonly TripMode[] = ["carThermal", ...LOW_CARBON_MODES];

export function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isVerified(t: TripLike): boolean {
  return t.status === "verified";
}

export function isLowCarbon(mode: TripMode): boolean {
  return mode !== "carThermal";
}

export interface ModeTotals {
  count: number;
  km: number;
  co2Kg: number;
  points: number;
}

export interface TripSummary {
  totalTrips: number;
  verifiedTrips: number;
  rejectedTrips: number;
  lowCarbonTrips: number;
  totalKm: number;
  co2Kg: number;
  points: number;
  byMode: Record<TripMode, ModeTotals>;
  favoriteMode: TripMode | null;
  longestTripKm: number;
  /** Number of distinct low-carbon modes with at least one verified trip. */
  modesUsed: number;
}

function emptyTotals(): ModeTotals {
  return { count: 0, km: 0, co2Kg: 0, points: 0 };
}

export function summarizeTrips(trips: readonly TripLike[]): TripSummary {
  const byMode = Object.fromEntries(
    ALL_MODES.map((m) => [m, emptyTotals()]),
  ) as Record<TripMode, ModeTotals>;

  let verifiedTrips = 0;
  let rejectedTrips = 0;
  let lowCarbonTrips = 0;
  let totalKm = 0;
  let co2Kg = 0;
  let points = 0;
  let longestTripKm = 0;

  for (const t of trips) {
    if (t.status === "rejected") rejectedTrips += 1;
    if (!isVerified(t)) continue;
    verifiedTrips += 1;
    const km = num(t.distance_km);
    const saved = num(t.co2_saved_kg);
    const pts = num(t.points_awarded);
    totalKm += km;
    co2Kg += saved;
    points += pts;
    const totals = byMode[t.mode];
    totals.count += 1;
    totals.km += km;
    totals.co2Kg += saved;
    totals.points += pts;
    if (isLowCarbon(t.mode)) {
      lowCarbonTrips += 1;
      longestTripKm = Math.max(longestTripKm, km);
    }
  }

  let favoriteMode: TripMode | null = null;
  let modesUsed = 0;
  for (const mode of LOW_CARBON_MODES) {
    const totals = byMode[mode];
    if (totals.count > 0) modesUsed += 1;
    if (totals.count > 0 && (!favoriteMode || totals.count > byMode[favoriteMode].count)) {
      favoriteMode = mode;
    }
  }

  return {
    totalTrips: trips.length,
    verifiedTrips,
    rejectedTrips,
    lowCarbonTrips,
    totalKm,
    co2Kg,
    points,
    byMode,
    favoriteMode,
    longestTripKm,
    modesUsed,
  };
}

/** Local calendar day key, e.g. "2026-11-20". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
}

const WEEKDAY_LETTERS = ["D", "L", "M", "M", "J", "V", "S"];

export interface DayStat {
  key: string;
  date: Date;
  /** One-letter French weekday for compact charts. */
  letter: string;
  isToday: boolean;
  co2Kg: number;
  points: number;
  trips: number;
}

/** Last `days` days (oldest first, today last) of verified activity. */
export function dailySeries(
  trips: readonly TripLike[],
  days = 7,
  now: Date = new Date(),
): DayStat[] {
  const buckets = new Map<string, DayStat>();
  const series: DayStat[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(now, -i);
    const stat: DayStat = {
      key: dayKey(date),
      date,
      letter: WEEKDAY_LETTERS[date.getDay()] ?? "",
      isToday: i === 0,
      co2Kg: 0,
      points: 0,
      trips: 0,
    };
    buckets.set(stat.key, stat);
    series.push(stat);
  }
  for (const t of trips) {
    if (!isVerified(t)) continue;
    const bucket = buckets.get(dayKey(new Date(t.created_at)));
    if (!bucket) continue;
    bucket.co2Kg += num(t.co2_saved_kg);
    bucket.points += num(t.points_awarded);
    bucket.trips += 1;
  }
  return series;
}

export interface WeekComparison {
  thisWeekKg: number;
  lastWeekKg: number;
  /** Percentage change vs the previous 7 days, null when there is no baseline. */
  changePct: number | null;
}

/** Rolling 7 days vs the 7 days before. */
export function weekOverWeek(
  trips: readonly TripLike[],
  now: Date = new Date(),
): WeekComparison {
  const startThis = addDays(now, -6).getTime();
  const startLast = addDays(now, -13).getTime();
  let thisWeekKg = 0;
  let lastWeekKg = 0;
  for (const t of trips) {
    if (!isVerified(t)) continue;
    const ts = new Date(t.created_at).getTime();
    if (ts >= startThis) thisWeekKg += num(t.co2_saved_kg);
    else if (ts >= startLast) lastWeekKg += num(t.co2_saved_kg);
  }
  return {
    thisWeekKg,
    lastWeekKg,
    changePct: lastWeekKg > 0 ? ((thisWeekKg - lastWeekKg) / lastWeekKg) * 100 : null,
  };
}

export interface StreakInfo {
  /** Consecutive days (ending today or yesterday) with a verified low-carbon trip. */
  current: number;
  best: number;
  activeToday: boolean;
}

export function computeStreak(
  trips: readonly TripLike[],
  now: Date = new Date(),
): StreakInfo {
  const days = new Set<string>();
  for (const t of trips) {
    if (isVerified(t) && isLowCarbon(t.mode)) days.add(dayKey(new Date(t.created_at)));
  }
  const activeToday = days.has(dayKey(now));

  let current = 0;
  let cursor = activeToday ? now : addDays(now, -1);
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  for (const key of days) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
    if (days.has(dayKey(addDays(date, -1)))) continue; // not the start of a run
    let run = 1;
    let next = addDays(date, 1);
    while (days.has(dayKey(next))) {
      run += 1;
      next = addDays(next, 1);
    }
    best = Math.max(best, run);
  }

  return { current, best: Math.max(best, current), activeToday };
}
