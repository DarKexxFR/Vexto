import Constants from "expo-constants";

interface VextoExtra {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapboxToken: string;
}

const MAPBOX_PLACEHOLDER = "pk.REPLACE_WITH_YOUR_MAPBOX_PUBLIC_TOKEN";

function readExtra(): VextoExtra {
  const extra = Constants.expoConfig?.extra as Partial<VextoExtra> | undefined;
  if (!extra?.supabaseUrl || !extra?.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase config. Set extra.supabaseUrl and extra.supabaseAnonKey in app.json.",
    );
  }
  return {
    supabaseUrl: extra.supabaseUrl,
    supabaseAnonKey: extra.supabaseAnonKey,
    mapboxToken: extra.mapboxToken ?? MAPBOX_PLACEHOLDER,
  };
}

export const config = readExtra();

/** True once a real Mapbox public token has been provided in app.json. */
export const isMapboxConfigured =
  config.mapboxToken.startsWith("pk.") &&
  config.mapboxToken !== MAPBOX_PLACEHOLDER;
