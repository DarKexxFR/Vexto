import Constants from "expo-constants";

interface VextoExtra {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  mapboxToken?: string;
}

const MAPBOX_PLACEHOLDER = "pk.REPLACE_WITH_YOUR_MAPBOX_PUBLIC_TOKEN";

const extra = (Constants.expoConfig?.extra ?? {}) as VextoExtra;

/**
 * Keys come from `.env` through app.config.ts → `expo.extra`. Missing keys no
 * longer crash the app at import time: the UI shows a setup screen instead.
 */
export const config = {
  supabaseUrl: extra.supabaseUrl ?? "",
  supabaseAnonKey: extra.supabaseAnonKey ?? "",
  mapboxToken: extra.mapboxToken ?? MAPBOX_PLACEHOLDER,
};

/** True when real Supabase credentials were provided (not the .env.example ones). */
export const isSupabaseConfigured =
  /^https?:\/\/.+/.test(config.supabaseUrl) &&
  !config.supabaseUrl.includes("your-project-ref") &&
  config.supabaseAnonKey.length > 20 &&
  !config.supabaseAnonKey.startsWith("your-");

/** True once a real Mapbox public token has been provided. */
export const isMapboxConfigured =
  config.mapboxToken.startsWith("pk.") &&
  config.mapboxToken !== MAPBOX_PLACEHOLDER &&
  !config.mapboxToken.includes("your_public_token");

export const appVersion: string = Constants.expoConfig?.version ?? "dev";
