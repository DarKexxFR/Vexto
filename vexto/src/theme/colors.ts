/**
 * Vexto — Modern Sage-Tech palette.
 * Single source of truth for colors used outside of Tailwind classes
 * (e.g. SVG fills, status bar, native props that don't accept className).
 * Keep in sync with tailwind.config.js.
 */
export const colors = {
  forest: "#102B19",
  forestSoft: "#1E4A2E",
  leaf: "#2A804D",
  leafSoft: "#E3F1E8",
  leafBright: "#6CCB8B",
  mineral: "#FAF9F5",
  card: "#FFFFFF",
  line: "#E2E1D9",
  ink: "#102B19",
  muted: "#6B7B72",
  faint: "#A3AEA7",
  danger: "#C0492F",
  dangerSoft: "#FBE9E4",
  amber: "#D98B1F",
  amberSoft: "#FDF1DC",
  sky: "#2F6FDE",
  skySoft: "#E4EDFC",
  violet: "#7A5AF8",
  violetSoft: "#EEE9FE",
  gold: "#D4A72C",
  silver: "#9AA5AE",
  bronze: "#C07A45",
  white: "#FFFFFF",
} as const;

export type ColorToken = keyof typeof colors;

/** Soft, warm elevation used by floating surfaces (cards stay flat). */
export const shadows = {
  floating: {
    shadowColor: colors.forest,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  soft: {
    shadowColor: colors.forest,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;

/** Deterministic pleasant color for avatars, from any string (e.g. a user id). */
const AVATAR_COLORS = ["#2A804D", "#2F6FDE", "#7A5AF8", "#D98B1F", "#C0492F", "#0F8B8D", "#B8487A"];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? colors.leaf;
}
