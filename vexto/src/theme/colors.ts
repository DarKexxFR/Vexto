/**
 * Vexto — Modern Sage-Tech palette.
 * Single source of truth for colors used outside of Tailwind classes
 * (e.g. SVG fills, status bar, native props that don't accept className).
 */
export const colors = {
  forest: "#102B19",
  leaf: "#2A804D",
  mineral: "#FAF9F5",
  card: "#FFFFFF",
  line: "#E2E1D9",
  ink: "#102B19",
  muted: "#6B7B72",
  danger: "#C0492F",
} as const;

export type ColorToken = keyof typeof colors;
