/**
 * Geometry helpers for live turn-by-turn navigation: snap the GPS position on
 * the route, find the upcoming maneuver, pick voice announcements, detect
 * off-route and arrival. Pure functions, unit-tested.
 */
import type { RouteStep, VoiceInstruction } from "@/domain/routing";

export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function metersBetween(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north (0..360). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Cumulative distance (m) at each vertex of a line. */
export function cumulativeDistances(line: readonly LngLat[]): number[] {
  const cum: number[] = [];
  let total = 0;
  for (let i = 0; i < line.length; i += 1) {
    const prev = line[i - 1];
    const curr = line[i];
    if (i > 0 && prev && curr) total += metersBetween(prev, curr);
    cum.push(total);
  }
  return cum;
}

export interface LineProjection {
  segmentIndex: number;
  /** Position within the segment (0..1). */
  t: number;
  point: LngLat;
  /** Distance from the input point to the line (m). */
  distanceM: number;
  /** Distance travelled along the line up to the projected point (m). */
  alongM: number;
}

/** Snap a point to the closest position on a polyline. */
export function projectOnLine(
  p: LngLat,
  line: readonly LngLat[],
  cum: readonly number[] = cumulativeDistances(line),
): LineProjection | null {
  const first = line[0];
  if (!first) return null;
  if (line.length === 1) {
    return { segmentIndex: 0, t: 0, point: first, distanceM: metersBetween(p, first), alongM: 0 };
  }
  // Local equirectangular projection centred on p (metres).
  const kx = Math.cos(toRad(p[1])) * (Math.PI / 180) * EARTH_RADIUS_M;
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;

  let best = Infinity;
  let bestIndex = 0;
  let bestT = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    if (!a || !b) continue;
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * ky;
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) {
      best = d;
      bestIndex = i;
      bestT = t;
    }
  }
  const a = line[bestIndex] as LngLat;
  const b = line[bestIndex + 1] as LngLat;
  const segStart = cum[bestIndex] ?? 0;
  const segEnd = cum[bestIndex + 1] ?? segStart;
  return {
    segmentIndex: bestIndex,
    t: bestT,
    point: [a[0] + bestT * (b[0] - a[0]), a[1] + bestT * (b[1] - a[1])],
    distanceM: best,
    alongM: segStart + bestT * (segEnd - segStart),
  };
}

/** Distance along the route at which each step's maneuver happens. */
export function stepStarts(steps: readonly Pick<RouteStep, "distanceM">[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    starts.push(acc);
    acc += s.distanceM;
  }
  return starts;
}

/** Index of the step the user is currently on. */
export function currentStepIndex(alongM: number, starts: readonly number[]): number {
  let idx = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if ((starts[i] ?? Infinity) <= alongM + 5) idx = i;
  }
  return idx;
}

export interface Guidance {
  /** Step the user is on. */
  stepIndex: number;
  /** Upcoming maneuver (the end of the current step), or null at the end. */
  next: RouteStep | null;
  distanceToNextM: number;
  remainingM: number;
}

export function guidanceFor(
  alongM: number,
  steps: readonly RouteStep[],
  starts: readonly number[],
  totalM: number,
): Guidance {
  const stepIndex = currentStepIndex(alongM, starts);
  const next = steps[stepIndex + 1] ?? null;
  const nextStart = starts[stepIndex + 1] ?? totalM;
  return {
    stepIndex,
    next,
    distanceToNextM: Math.max(0, nextStart - alongM),
    remainingM: Math.max(0, totalM - alongM),
  };
}

export interface Announcement {
  keys: string[];
  text: string;
}

/**
 * Voice instruction to speak now, if any. Instructions belong to the current
 * step and fire when the distance left in the step drops below their trigger.
 * When several are due (e.g. after a GPS gap), only the most relevant (closest
 * to the maneuver) is spoken; the stale ones are marked as spoken too.
 */
export function pickAnnouncement(
  stepIndex: number,
  remainingInStepM: number,
  voice: readonly VoiceInstruction[],
  spoken: ReadonlySet<string>,
): Announcement | null {
  const due = voice
    .map((v, i) => ({ v, key: `${stepIndex}:${i}` }))
    .filter(({ v, key }) => !spoken.has(key) && remainingInStepM <= v.distanceAlongM + 5);
  if (due.length === 0) return null;
  const chosen = due.reduce((a, b) => (b.v.distanceAlongM < a.v.distanceAlongM ? b : a));
  return { keys: due.map((d) => d.key), text: chosen.v.announcement };
}

/** Off-route when farther than ~40 m from the route (more if GPS is poor). */
export function isOffRoute(distanceM: number, accuracyM: number | null): boolean {
  const tolerance = Math.max(40, Math.min(100, (accuracyM ?? 0) * 1.5));
  return distanceM > tolerance;
}

export function hasArrived(distanceToDestinationM: number, remainingAlongM: number | null): boolean {
  if (distanceToDestinationM <= 35) return true;
  return remainingAlongM != null && remainingAlongM <= 25 && distanceToDestinationM <= 70;
}

/** Remaining minutes at the route's average pace (stable, unlike live speed). */
export function remainingMinutes(
  remainingM: number,
  routeDistanceKm: number,
  routeDurationMin: number,
): number {
  if (routeDistanceKm <= 0 || routeDurationMin <= 0) return 0;
  const minPerKm = routeDurationMin / routeDistanceKm;
  return (Math.max(0, remainingM) / 1000) * minPerKm;
}

/** Ionicons-friendly arrow for a maneuver. */
export type ManeuverGlyph =
  | "straight"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "roundabout"
  | "arrive"
  | "depart";

export function maneuverGlyph(step: Pick<RouteStep, "maneuverType" | "modifier">): ManeuverGlyph {
  const type = step.maneuverType;
  if (type === "arrive") return "arrive";
  if (type === "depart") return "depart";
  if (type === "roundabout" || type === "rotary" || type === "roundabout turn") return "roundabout";
  switch (step.modifier) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "slight left":
      return "slight-left";
    case "slight right":
      return "slight-right";
    case "sharp left":
      return "sharp-left";
    case "sharp right":
      return "sharp-right";
    case "uturn":
      return "uturn";
    default:
      return "straight";
  }
}
