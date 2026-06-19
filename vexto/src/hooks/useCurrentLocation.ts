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
        setError("Autorisation de localisation refusée.");
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
