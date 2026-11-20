import { McIcon, type McIconName } from "@/components/Icon";
import type { ManeuverGlyph } from "@/domain/navigation";

const GLYPHS: Record<ManeuverGlyph, McIconName> = {
  straight: "arrow-up",
  left: "arrow-left-top",
  right: "arrow-right-top",
  "slight-left": "arrow-top-left",
  "slight-right": "arrow-top-right",
  "sharp-left": "arrow-bottom-left",
  "sharp-right": "arrow-bottom-right",
  uturn: "arrow-u-left-top",
  roundabout: "rotate-left",
  arrive: "flag-checkered",
  depart: "navigation-variant",
};

export function ManeuverIcon({ glyph, size = 34, color = "#FFFFFF" }: { glyph: ManeuverGlyph; size?: number; color?: string }) {
  return <McIcon name={GLYPHS[glyph]} size={size} color={color} />;
}
