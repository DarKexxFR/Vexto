import { create } from "zustand";

import { coachAdvice, type CoachAdvice, type WeatherNow } from "@/domain/weather";
import { getKnownPosition, requestPosition } from "@/hooks/useCurrentLocation";
import { fetchWeather } from "@/lib/weather";
import { usePrefsStore } from "@/store/usePrefsStore";

type WeatherStatus = "idle" | "loading" | "ready" | "needs-location" | "error";

const FRESH_MS = 15 * 60_000;

interface WeatherState {
  status: WeatherStatus;
  weather: WeatherNow | null;
  advice: CoachAdvice | null;
  /** Where the forecast is for ("Autour de vous", "Maison"). */
  placeLabel: string | null;
  fetchedAt: number | null;
  /** Load (or refresh) the forecast. `askPermission` may prompt for location. */
  load: (opts?: { force?: boolean; askPermission?: boolean }) => Promise<void>;
}

/** Shared weather coach state (Home card + smarter route recommendations). */
export const useWeatherStore = create<WeatherState>((set, get) => ({
  status: "idle",
  weather: null,
  advice: null,
  placeLabel: null,
  fetchedAt: null,

  load: async ({ force = false, askPermission = false } = {}) => {
    const { fetchedAt, status } = get();
    if (status === "loading") return;
    if (!force && fetchedAt && Date.now() - fetchedAt < FRESH_MS) return;
    set({ status: "loading" });

    let coords = await getKnownPosition();
    let placeLabel = "Autour de vous";
    if (!coords && askPermission) coords = await requestPosition();
    if (!coords) {
      const home = usePrefsStore.getState().home;
      if (home) {
        coords = home.coords;
        placeLabel = "À la maison";
      }
    }
    if (!coords) {
      set({ status: "needs-location" });
      return;
    }
    try {
      const weather = await fetchWeather(coords);
      set({
        status: "ready",
        weather,
        advice: coachAdvice(weather),
        placeLabel,
        fetchedAt: Date.now(),
      });
    } catch {
      set({ status: "error" });
    }
  },
}));
