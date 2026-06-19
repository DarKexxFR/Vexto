import type { ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config. Secrets/keys are read from the environment (.env, loaded
 * automatically by the Expo CLI) instead of being hard-coded, so they never get
 * committed. See .env.example for the required variables.
 */
const config: ExpoConfig = {
  name: "Vexto",
  slug: "vexto",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "vexto",
  userInterfaceStyle: "light",
  splash: {
    resizeMode: "contain",
    backgroundColor: "#102B19",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.vexto.app",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Vexto utilise votre position pour valider vos trajets bas-carbone.",
    },
  },
  android: {
    package: "com.vexto.app",
    permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
  },
  web: {
    bundler: "metro",
  },
  plugins: ["expo-location", "expo-web-browser"],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    mapboxToken: process.env.MAPBOX_TOKEN,
  },
};

export default config;
