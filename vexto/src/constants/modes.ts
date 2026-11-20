import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";
import type { TripMode } from "@/types/database";

export type McIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface ModeMeta {
  mode: TripMode;
  label: string;
  shortLabel: string;
  emoji: string;
  icon: McIconName;
  /** Foreground / accent color. */
  color: string;
  /** Soft background tint. */
  tint: string;
  /** Whether this mode requires PostGIS anti-cheat validation. */
  requiresGeoCheck: boolean;
}

export const MODES: Record<TripMode, ModeMeta> = {
  carThermal: {
    mode: "carThermal",
    label: "Voiture",
    shortLabel: "Voiture",
    emoji: "🚗",
    icon: "car-side",
    color: "#5E6B64",
    tint: "#ECEDEA",
    requiresGeoCheck: false,
  },
  publicTransit: {
    mode: "publicTransit",
    label: "Transports en commun",
    shortLabel: "Transports",
    emoji: "🚆",
    icon: "subway-variant",
    color: colors.sky,
    tint: colors.skySoft,
    requiresGeoCheck: true,
  },
  bike: {
    mode: "bike",
    label: "Vélo",
    shortLabel: "Vélo",
    emoji: "🚲",
    icon: "bike",
    color: colors.leaf,
    tint: colors.leafSoft,
    requiresGeoCheck: false,
  },
  eScooter: {
    mode: "eScooter",
    label: "Trottinette électrique",
    shortLabel: "Trottinette",
    emoji: "🛴",
    icon: "human-scooter",
    color: colors.violet,
    tint: colors.violetSoft,
    requiresGeoCheck: false,
  },
  walk: {
    mode: "walk",
    label: "Marche",
    shortLabel: "Marche",
    emoji: "🚶",
    icon: "walk",
    color: colors.amber,
    tint: colors.amberSoft,
    requiresGeoCheck: false,
  },
};
