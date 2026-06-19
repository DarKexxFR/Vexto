import { useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";

import { trackLengthKm } from "@/lib/geo";

export type TrackerStatus = "idle" | "tracking" | "denied" | "error";

interface UseTripTracker {
  status: TrackerStatus;
  /** Latest position as [lon, lat]. */
  position: [number, number] | null;
  /** Ordered recorded track as [lon, lat] points. */
  track: Array<[number, number]>;
  /** Distance actually travelled so far (km), from the recorded track. */
  traveledKm: number;
  start: () => Promise<boolean>;
  stop: () => void;
}

/**
 * Watches the device position and records the travelled track. Used for the
 * live "navigation" experience and to capture the GPS trace that the server
 * (`verify_trip`) will check against the official transit route (anti-cheat).
 */
export function useTripTracker(): UseTripTracker {
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [track, setTrack] = useState<Array<[number, number]>>([]);
  const sub = useRef<Location.LocationSubscription | null>(null);

  const start = async (): Promise<boolean> => {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setStatus("denied");
      return false;
    }
    setTrack([]);
    setStatus("tracking");
    try {
      sub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          const coords: [number, number] = [
            loc.coords.longitude,
            loc.coords.latitude,
          ];
          setPosition(coords);
          setTrack((prev) => [...prev, coords]);
        },
      );
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  };

  const stop = () => {
    sub.current?.remove();
    sub.current = null;
    setStatus("idle");
  };

  useEffect(() => {
    return () => {
      sub.current?.remove();
      sub.current = null;
    };
  }, []);

  const traveledKm = useMemo(() => trackLengthKm(track), [track]);

  return { status, position, track, traveledKm, start, stop };
}
