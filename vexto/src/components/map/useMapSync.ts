import { useEffect } from "react";

import type { MapCommand } from "@/components/map/mapHtml";
import type { GeoLineString } from "@/types/database";

export interface MapViewProps {
  token: string;
  start: [number, number] | null;
  end: [number, number] | null;
  routeGeometry: GeoLineString | null;
  /** Route color (defaults to leaf green). */
  routeColor?: string;
  /** Dashed route (used for estimated transit paths). */
  routeDashed?: boolean;
  /** Already travelled breadcrumb, drawn in grey. */
  traveled?: Array<[number, number]> | null;
  /** Live user position [lon, lat] (e.g. during navigation). */
  user?: [number, number] | null;
  /** Course in degrees, rotates the user marker and the camera. */
  heading?: number | null;
  /** Navigation camera: follows the user (until they pan the map). */
  followUser?: boolean;
  /** Increment to re-enable follow mode after a pan. */
  recenterSignal?: number;
  /** Map height in px. If omitted, the map fills its parent (flex: 1). */
  height?: number;
  onUserPan?: () => void;
}

const MAX_TRAVELED_POINTS = 600;

/** Downsample long breadcrumbs so bridge messages stay small. */
function decimate(coords: Array<[number, number]>): Array<[number, number]> {
  if (coords.length <= MAX_TRAVELED_POINTS) return coords;
  const step = Math.ceil(coords.length / MAX_TRAVELED_POINTS);
  const out = coords.filter((_, i) => i % step === 0);
  const last = coords[coords.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Push prop changes to the map page once it is ready. */
export function useMapSync(
  send: (command: MapCommand, payload: unknown) => void,
  ready: boolean,
  props: MapViewProps,
): void {
  const {
    start,
    end,
    routeGeometry,
    routeColor,
    routeDashed = false,
    traveled,
    user,
    heading,
    followUser = false,
    recenterSignal = 0,
  } = props;

  useEffect(() => {
    if (!ready) return;
    send("apply", {
      start,
      end,
      line: routeGeometry,
      color: routeColor,
      dashed: routeDashed,
      // While following the user (navigation) the camera stays on them.
      fit: !followUser,
    });
  }, [send, ready, start, end, routeGeometry, routeColor, routeDashed, followUser]);

  useEffect(() => {
    if (!ready) return;
    send("traveled", { coords: decimate(traveled ?? []) });
  }, [send, ready, traveled]);

  useEffect(() => {
    if (!ready) return;
    send("user", { coords: user ?? null, follow: followUser, heading: heading ?? null });
  }, [send, ready, user, followUser, heading]);

  useEffect(() => {
    if (!ready || recenterSignal === 0) return;
    send("recenter", {});
  }, [send, ready, recenterSignal]);
}
