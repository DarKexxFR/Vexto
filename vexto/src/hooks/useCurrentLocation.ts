import { useState } from "react";
import * as Location from "expo-location";

interface UseCurrentLocation {
  loading: boolean;
  error: string | null;
  /** Returns [lon, lat] or null if permission denied / unavailable. */
  request: () => Promise<[number, number] | null>;
}

/** Requests foreground permission and resolves the device's current position. */
export function useCurrentLocation(): UseCurrentLocation {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async (): Promise<[number, number] | null> => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Autorisation de localisation refusée. Activez-la dans les réglages.");
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return [pos.coords.longitude, pos.coords.latitude];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Localisation indisponible.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, request };
}

/**
 * Best-effort position WITHOUT prompting: only when permission was already
 * granted (used to bias search results and for the weather coach).
 */
export async function getKnownPosition(): Promise<[number, number] | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60_000 }).catch(() => null);
    if (last) return [last.coords.longitude, last.coords.latitude];
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return [current.coords.longitude, current.coords.latitude];
  } catch {
    return null;
  }
}

/** Prompt for permission, then resolve the position (null if refused). */
export async function requestPosition(): Promise<[number, number] | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return [pos.coords.longitude, pos.coords.latitude];
  } catch {
    return null;
  }
}
