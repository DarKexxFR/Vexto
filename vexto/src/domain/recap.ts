/**
 * Monthly recap ("Mon bilan du mois"): what the user achieved in a calendar
 * month, compared with the previous one, plus a shareable text.
 */
import { formatCo2, formatDecimal, formatInt } from "@/domain/format";
import { KG_PER_TREE } from "@/domain/forest";
import { ALL_MODES, dayKey, isLowCarbon, isVerified, num, type TripLike } from "@/domain/stats";
import type { TripMode } from "@/types/database";

export interface MonthRecap {
  year: number;
  /** 0-11 */
  month: number;
  trips: number;
  lowCarbonTrips: number;
  km: number;
  co2Kg: number;
  points: number;
  activeDays: number;
  byMode: Record<TripMode, { count: number; km: number }>;
  favoriteMode: TripMode | null;
  bestDay: { date: Date; co2Kg: number } | null;
  /** Share of low-carbon trips among verified ones, 0-1. */
  greenShare: number;
  /** Trees' worth of CO₂ (1 tree ≈ 25 kg). */
  trees: number;
  /** % change of CO₂ saved vs the previous month (null if it had none). */
  co2ChangePct: number | null;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

function inMonth(t: TripLike, year: number, month: number): boolean {
  const d = new Date(t.created_at);
  return d.getFullYear() === year && d.getMonth() === month;
}

function co2Of(trips: readonly TripLike[], year: number, month: number): number {
  return trips.filter((t) => isVerified(t) && inMonth(t, year, month)).reduce((s, t) => s + num(t.co2_saved_kg), 0);
}

export function monthRecap(trips: readonly TripLike[], year: number, month: number): MonthRecap {
  const list = trips.filter((t) => isVerified(t) && inMonth(t, year, month));
  const byMode = Object.fromEntries(ALL_MODES.map((m) => [m, { count: 0, km: 0 }])) as MonthRecap["byMode"];
  const perDay = new Map<string, { date: Date; co2Kg: number }>();
  let km = 0;
  let co2Kg = 0;
  let points = 0;
  let low = 0;
  for (const t of list) {
    const d = new Date(t.created_at);
    const k = num(t.distance_km);
    const c = num(t.co2_saved_kg);
    km += k;
    co2Kg += c;
    points += num(t.points_awarded);
    byMode[t.mode].count += 1;
    byMode[t.mode].km += k;
    if (isLowCarbon(t.mode)) low += 1;
    const key = dayKey(d);
    const day = perDay.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), co2Kg: 0 };
    day.co2Kg += c;
    perDay.set(key, day);
  }
  const favorite = ALL_MODES.filter((m) => isLowCarbon(m) && byMode[m].count > 0).sort(
    (a, b) => byMode[b].count - byMode[a].count || byMode[b].km - byMode[a].km,
  )[0];
  const best = [...perDay.values()].sort((a, b) => b.co2Kg - a.co2Kg)[0];
  const prev = month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 };
  const prevCo2 = co2Of(trips, prev.y, prev.m);
  return {
    year,
    month,
    trips: list.length,
    lowCarbonTrips: low,
    km,
    co2Kg,
    points,
    activeDays: perDay.size,
    byMode,
    favoriteMode: favorite ?? null,
    bestDay: best && best.co2Kg > 0 ? best : null,
    greenShare: list.length > 0 ? low / list.length : 0,
    trees: co2Kg / KG_PER_TREE,
    co2ChangePct: prevCo2 > 0 ? ((co2Kg - prevCo2) / prevCo2) * 100 : null,
  };
}

/** Months (newest first) from the first trip's month up to `now`. */
export function recapMonths(trips: readonly TripLike[], now: Date = new Date()): { year: number; month: number }[] {
  const dates = trips.map((t) => new Date(t.created_at).getTime()).filter(Number.isFinite);
  const first = dates.length > 0 ? new Date(Math.min(...dates)) : now;
  const out: { year: number; month: number }[] = [];
  let y = now.getFullYear();
  let m = now.getMonth();
  while (y > first.getFullYear() || (y === first.getFullYear() && m >= first.getMonth())) {
    out.push({ year: y, month: m });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (out.length >= 36) break;
  }
  return out;
}

export function recapShareText(r: MonthRecap, modeLabel: (m: TripMode) => string): string {
  const lines = [
    `🌿 Mon bilan Vexto · ${monthLabel(r.year, r.month)}`,
    `☁️ ${formatCo2(r.co2Kg)} de CO₂ évités`,
    `🧭 ${formatInt(r.lowCarbonTrips)} trajets verts · ${formatDecimal(r.km, 1)} km`,
    `🌳 ≈ ${formatDecimal(r.trees, 1)} arbre${r.trees >= 2 ? "s" : ""} de CO₂`,
  ];
  if (r.favoriteMode) lines.push(`❤️ Mode préféré : ${modeLabel(r.favoriteMode)}`);
  lines.push("Rejoins-moi sur Vexto !");
  return lines.join("\n");
}
