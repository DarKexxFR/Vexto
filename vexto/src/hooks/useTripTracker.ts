import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";

import { metersBetween } from "@/domain/navigation";
import { webWatchPosition } from "@/lib/webGeolocation";

export type TrackerStatus = "idle" | "starting" | "tracking" | "paused" | "denied" | "error";

/** Fixes less precise than this are shown but not recorded in the track. */
const MAX_ACCURACY_M = 50;
/** Anything faster is a GPS glitch (≈ 250 km/h). */
const MAX_SPEED_MPS = 70;

/**
 * Remove a position watch without ever throwing. expo-location 19 on web
 * clears the watch, then throws "removeSubscription is not a function" — which
 * must not prevent finishing a trip.
 */
function safeRemove(subscription: Location.LocationSubscription | null): void {
  try {
    subscription?.remove();
  } catch {
    // the underlying watch is already cleared at this point
  }
}

interface UseTripTracker {
  status: TrackerStatus;
  /** Latest position as [lon, lat]. */
  position: [number, number] | null;
  accuracyM: number | null;
  /** Course over ground (degrees), when moving. */
  headingDeg: number | null;
  speedKmh: number | null;
  /** Ordered, filtered track as [lon, lat] points. */
  track: Array<[number, number]>;
  /** Distance actually travelled so far (km), from the filtered track. */
  traveledKm: number;
  startedAt: Date | null;
  /** Active time in seconds (pauses excluded). */
  getElapsedSeconds: () => number;
  start: () => Promise<boolean>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Watches the device position and records the travelled track. Noise is
 * filtered (imprecise fixes, stationary jitter, impossible jumps) so the
 * distance — and the GPS trace checked server-side — stay honest.
 */
export function useTripTracker(): UseTripTracker {
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [track, setTrack] = useState<Array<[number, number]>>([]);
  const [traveledKm, setTraveledKm] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);

  const sub = useRef<Location.LocationSubscription | null>(null);
  const lastPoint = useRef<{ coords: [number, number]; t: number } | null>(null);
  const distanceM = useRef(0);
  const paused = useRef(false);
  const pausedAt = useRef<number | null>(null);
  const pausedTotalMs = useRef(0);
  const startedAtMs = useRef<number | null>(null);

  const onLocation = useCallback((loc: Pick<Location.LocationObject, "timestamp"> & { coords: Pick<Location.LocationObjectCoords, "latitude" | "longitude" | "accuracy" | "speed" | "heading"> }) => {
    const coords: [number, number] = [loc.coords.longitude, loc.coords.latitude];
    const accuracy = loc.coords.accuracy ?? null;
    setPosition(coords);
    setAccuracyM(accuracy);
    const rawSpeed = loc.coords.speed;
    if (rawSpeed != null && rawSpeed >= 0) setSpeedKmh(rawSpeed * 3.6);
    const rawHeading = loc.coords.heading;
    if (rawHeading != null && rawHeading >= 0 && (rawSpeed ?? 1) > 0.8) setHeadingDeg(rawHeading);

    if (paused.current) return;
    if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

    const last = lastPoint.current;
    const t = loc.timestamp || Date.now();
    if (last) {
      const d = metersBetween(last.coords, coords);
      const minStep = Math.min(25, Math.max(5, (accuracy ?? 10) * 0.6));
      if (d < minStep) return; // stationary jitter
      const dt = (t - last.t) / 1000;
      if (dt > 0 && d / dt > MAX_SPEED_MPS) return; // teleport = glitch
      distanceM.current += d;
      setTraveledKm(distanceM.current / 1000);
      if (rawSpeed == null || rawSpeed < 0) setSpeedKmh(dt > 0 ? (d / dt) * 3.6 : null);
    }
    lastPoint.current = { coords, t };
    setTrack((prev) => [...prev, coords]);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    safeRemove(sub.current);
    sub.current = null;
    setStatus("starting");
    try {
      const web = Platform.OS === "web";
      // Web: the browser asks on the first watch (expo's permission shim is
      // unreliable on Safari).
      if (!web) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          setStatus("denied");
          return false;
        }
      }
      lastPoint.current = null;
      distanceM.current = 0;
      paused.current = false;
      pausedAt.current = null;
      pausedTotalMs.current = 0;
      startedAtMs.current = Date.now();
      setStartedAt(new Date(startedAtMs.current));
      setTrack([]);
      setTraveledKm(0);
      setSpeedKmh(null);
      setHeadingDeg(null);
      if (web) {
        // Direct browser GPS (Safari-safe); the prompt appears on first watch.
        const stopWatch = webWatchPosition(onLocation, (e) => {
          if (e.code === "denied" || e.code === "unsupported" || e.code === "insecure") {
            stopWatch();
            setStatus(e.code === "denied" ? "denied" : "error");
          }
        });
        sub.current = { remove: stopWatch } as Location.LocationSubscription;
      } else {
        sub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 4 },
          onLocation,
        );
      }
      setStatus("tracking");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, [onLocation]);

  const stop = useCallback(() => {
    safeRemove(sub.current);
    sub.current = null;
    if (pausedAt.current != null) {
      pausedTotalMs.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
    paused.current = false;
    setStatus("idle");
  }, []);

  const pause = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    pausedAt.current = Date.now();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    if (pausedAt.current != null) pausedTotalMs.current += Date.now() - pausedAt.current;
    pausedAt.current = null;
    // Don't bridge the gap: the next fix starts a fresh segment reference.
    lastPoint.current = null;
    setStatus("tracking");
  }, []);

  const getElapsedSeconds = useCallback((): number => {
    if (startedAtMs.current == null) return 0;
    const pausedNow = pausedAt.current != null ? Date.now() - pausedAt.current : 0;
    return Math.max(0, (Date.now() - startedAtMs.current - pausedTotalMs.current - pausedNow) / 1000);
  }, []);

  useEffect(() => {
    return () => {
      safeRemove(sub.current);
      sub.current = null;
    };
  }, []);

  return {
    status,
    position,
    accuracyM,
    headingDeg,
    speedKmh,
    track,
    traveledKm,
    startedAt,
    getElapsedSeconds,
    start,
    stop,
    pause,
    resume,
  };
}
