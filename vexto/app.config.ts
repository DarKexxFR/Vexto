import type { ExpoConfig } from "expo/config";

/**
 * Dynamic Expo config. Secrets/keys are read from the environment (.env, loaded
 * automatically by the Expo CLI) instead of being hard-coded, so they never get
 * committed. See .env.example for the required variables.
 *
 * EXPO_BASE_URL lets the web build live under a sub-path (e.g. "/Vexto" on
 * GitHub Pages); it is set by .github/workflows/deploy-web.yml.
 */
const config: ExpoConfig = {
  name: "Vexto",
  slug: "vexto",
  version: "0.2.0",
  orientation: "portrait",
  scheme: "vexto",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#102B19",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.vexto.app",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Vexto utilise votre position pour vous guider et valider vos trajets bas-carbone.",
    },
  },
  android: {
    package: "com.vexto.app",
    permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#102B19",
    },
  },
  web: {
    bundler: "metro",
    output: "single",
    name: "Vexto — trajets bas-carbone",
    shortName: "Vexto",
    lang: "fr",
    description:
      "Trajets bas-carbone, horaires RATP/IDFM en temps réel, points et forêt virtuelle.",
    themeColor: "#102B19",
    backgroundColor: "#FAF9F5",
    favicon: "./public/favicon.png",
  },
  experiments: {
    baseUrl: process.env.EXPO_BASE_URL || undefined,
  },
  plugins: ["expo-location", "expo-web-browser"],
  extra: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    mapboxToken: process.env.MAPBOX_TOKEN,
  },
};

export default config;
