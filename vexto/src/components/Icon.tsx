import type { ComponentProps } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { colors } from "@/theme/colors";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type McIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Ionicons with Vexto defaults. */
export function Icon({ name, size = 20, color = colors.forest }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}

interface McIconProps {
  name: McIconName;
  size?: number;
  color?: string;
}

/** Material Community Icons (transport modes, maneuvers). */
export function McIcon({ name, size = 20, color = colors.forest }: McIconProps) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
