/** French-locale formatting helpers shared across screens. */

const NBSP = " ";

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export function formatInt(n: number): string {
  return Math.round(safe(n)).toLocaleString("fr-FR");
}

/** Decimal number with a French comma, e.g. `formatDecimal(2.5, 1)` → "2,5". */
export function formatDecimal(n: number, digits = 1): string {
  return safe(n).toFixed(digits).replace(".", ",");
}

/** "1,25 kg" — two decimals, comma separator. */
export function formatKg(kg: number): string {
  return `${formatDecimal(kg, 2)}${NBSP}kg`;
}

/**
 * Human CO₂ amount: grams below 1 kg, then kg with decreasing precision, then
 * tonnes. e.g. 0.45 → "450 g", 2.08 → "2,08 kg", 28.4 → "28,4 kg", 1520 → "1,52 t".
 */
export function formatCo2(kg: number): string {
  const v = Math.max(0, safe(kg));
  if (v < 1) return `${formatInt(v * 1000)}${NBSP}g`;
  if (v < 10) return formatKg(v);
  if (v < 100) return `${formatDecimal(v, 1)}${NBSP}kg`;
  if (v < 1000) return `${formatInt(v)}${NBSP}kg`;
  return `${formatDecimal(v / 1000, 2)}${NBSP}t`;
}

export function formatKm(km: number): string {
  return `${formatDecimal(km, 1)}${NBSP}km`;
}

/** Distance for navigation: metres below 1 km (rounded to 10 m), then km. */
export function formatDistance(km: number): string {
  const v = Math.max(0, safe(km));
  if (v < 1) return `${Math.round((v * 1000) / 10) * 10}${NBSP}m`;
  if (v < 10) return `${formatDecimal(v, 1)}${NBSP}km`;
  return `${formatInt(v)}${NBSP}km`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, safe(minutes));
  if (m < 60) return `${Math.max(1, Math.round(m))}${NBSP}min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  if (rest === 60) return `${h + 1}${NBSP}h${NBSP}00`;
  return `${h}${NBSP}h${NBSP}${String(rest).padStart(2, "0")}`;
}

/** Stopwatch style: "4:05", "1:02:03". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(safe(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** "08:45" */
export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Aujourd'hui", "Hier", or "lun. 12 nov." */
export function formatRelativeDay(date: Date, now: Date = new Date()): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "novembre 2026" */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function pluralize(n: number, singular: string, plural: string): string {
  return Math.abs(n) >= 2 ? plural : singular;
}

/** First name from a full name, falling back to the whole string. */
export function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Up to two upper-case initials ("Inès Martin" → "IM"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "V";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Time-of-day greeting. */
export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Bonjour";
  if (h >= 12 && h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** "+35 %" / "−12 %" */
export function formatChange(pct: number): string {
  const rounded = Math.round(safe(pct));
  if (rounded === 0) return `=${NBSP}0${NBSP}%`;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}${NBSP}%`;
}
