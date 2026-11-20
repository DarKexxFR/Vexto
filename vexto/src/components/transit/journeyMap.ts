import type { MapPoint, MapSegment } from "@/components/map/useMapSync";
import type { LineDetail, TransitJourney } from "@/domain/transit";
import { colors } from "@/theme/colors";

/** Coloured map segments for an itinerary: lines in their colour, walks dotted. */
export function journeySegments(journey: TransitJourney | null): MapSegment[] | null {
  if (!journey) return null;
  const segs = journey.legs
    .filter((l) => l.geometry.length > 1)
    .map((l) => ({
      coordinates: l.geometry,
      color: l.type === "transit" && l.line ? l.line.color : colors.muted,
      dashed: l.type !== "transit",
    }));
  return segs.length > 0 ? segs : null;
}

/**
 * Stations of each transit leg: boarding / exit / transfer stops big and
 * always labelled, intermediate stations small (labelled when zoomed in).
 */
export function journeyPoints(journey: TransitJourney | null): MapPoint[] | null {
  if (!journey) return null;
  const points: MapPoint[] = [];
  for (const l of journey.legs) {
    if (l.type !== "transit" || !l.line) continue;
    const color = l.line.color;
    l.stopList.slice(1, -1).forEach((st) => {
      if (st.coords) points.push({ coordinates: st.coords, color, label: st.name, major: false });
    });
    if (l.fromCoords) points.push({ coordinates: l.fromCoords, color, label: l.from, major: true });
    if (l.toCoords) points.push({ coordinates: l.toCoords, color, label: l.to, major: true });
  }
  return points;
}

export function lineSegments(detail: LineDetail | null): MapSegment[] | null {
  if (!detail || detail.shape.length === 0) return null;
  return detail.shape.map((part) => ({ coordinates: part, color: detail.badge.color }));
}

export function linePoints(detail: LineDetail | null): MapPoint[] | null {
  if (!detail) return null;
  const stops = detail.stops.filter((s): s is typeof s & { coords: [number, number] } => s.coords !== null);
  // Termini always labelled, other stations when zoomed in.
  return stops.map((s, i) => ({
    coordinates: s.coords,
    color: detail.badge.color,
    label: s.name,
    major: i === 0 || i === stops.length - 1,
  }));
}
