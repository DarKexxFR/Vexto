/** Daily commute helpers (home ↔ work). */

export type CommuteDirection = "toWork" | "toHome";

/** Morning → to work, afternoon/evening → back home (weekends: home first). */
export function defaultCommuteDirection(now: Date = new Date()): CommuteDirection {
  const day = now.getDay();
  if (day === 0 || day === 6) return "toHome";
  return now.getHours() < 14 ? "toWork" : "toHome";
}

/** "Partez maintenant" / "Partez dans 6 min" / "Partez dans 1 h 05". */
export function leaveLabel(minutes: number): string {
  if (minutes <= 0) return "Partez maintenant";
  if (minutes < 60) return `Partez dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Partez dans ${h} h ${String(m).padStart(2, "0")}`;
}
