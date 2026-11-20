import type { LngLat } from "@/domain/navigation";

/**
 * Data source behind a transit result. Mirrors the "transit" Edge Function:
 * IDFM PRIM in Île-de-France, Divia (navitia.io) around Dijon, SNCF elsewhere.
 */
export type TransitRegion = "idfm" | "dijon" | "sncf";

export const isRegion = (r: unknown): r is TransitRegion => r === "idfm" || r === "dijon" || r === "sncf";

/** Local network covering a point; national rail (SNCF) everywhere else. */
export function regionAt([lon, lat]: LngLat): TransitRegion {
  if (lon >= 1.4 && lon <= 3.6 && lat >= 48.1 && lat <= 49.25) return "idfm";
  if (lon >= 4.85 && lon <= 5.25 && lat >= 47.2 && lat <= 47.45) return "dijon";
  return "sncf";
}

/**
 * Stop / line ids carry their source so later calls go to the right API.
 * IDFM ids stay unchanged (saved favourites keep working); others become
 * "sncf|stop_area:SNCF:87713040".
 */
export function tagId(region: TransitRegion, id: string): string {
  return region === "idfm" || id.includes("|") ? id : `${region}|${id}`;
}

export function untagId(tagged: string): { region: TransitRegion; id: string } {
  const bar = tagged.indexOf("|");
  if (bar > 0) {
    const region = tagged.slice(0, bar);
    if (isRegion(region)) return { region, id: tagged.slice(bar + 1) };
  }
  return { region: "idfm", id: tagged };
}
