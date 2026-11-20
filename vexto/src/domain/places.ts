import { metersBetween } from "@/domain/navigation";

/** A named location, coordinates are [lon, lat]. */
export interface Place {
  label: string;
  coords: [number, number];
}

/** "12 Rue de Rivoli, 75004 Paris" → "12 Rue de Rivoli". */
export function shortPlaceLabel(label: string): string {
  return label.split(",")[0]?.trim() || label;
}

/** Same label, or less than 30 m apart. */
export function isSamePlace(a: Place, b: Place): boolean {
  return a.label === b.label || metersBetween(a.coords, b.coords) < 30;
}

/** Most-recent-first list without duplicates, capped at `max`. */
export function pushRecent(list: readonly Place[], place: Place, max = 6): Place[] {
  return [place, ...list.filter((p) => !isSamePlace(p, place))].slice(0, max);
}
