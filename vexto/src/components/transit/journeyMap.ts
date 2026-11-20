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

/** Boarding / alighting stops of each transit leg. */
export function journeyPoints(journey: TransitJourney | null): MapPoint[] | null {
  if (!journey) return null;
  const points: MapPoint[] = [];
  for (const l of journey.legs) {
    if (l.type !== "transit" || !l.line) continue;
    if (l.fromCoords) points.push({ coordinates: l.fromCoords, color: l.line.color });
    if (l.toCoords) points.push({ coordinates: l.toCoords, color: l.line.color });
  }
  return points;
}

export function lineSegments(detail: LineDetail | null): MapSegment[] | null {
  if (!detail || detail.shape.length === 0) return null;
  return detail.shape.map((part) => ({ coordinates: part, color: detail.badge.color }));
}

export function linePoints(detail: LineDetail | null): MapPoint[] | null {
  if (!detail) return null;
  return detail.stops
    .filter((s): s is typeof s & { coords: [number, number] } => s.coords !== null)
    .map((s) => ({ coordinates: s.coords, color: detail.badge.color }));
}
