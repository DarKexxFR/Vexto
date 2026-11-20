import { useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

import {
  forestState,
  layoutForest,
  mulberry32,
  seasonFor,
  skyPhase,
  wildlifeFor,
  type Season,
  type SkyPhase,
  type TreePlacement,
  type TreeSpecies,
} from "@/domain/forest";

interface ForestSceneProps {
  co2Kg: number;
  width: number;
  height: number;
  date?: Date;
  showWildlife?: boolean;
  /** Cap on drawn trees (perf); the rest is summarised as "+N". */
  maxTrees?: number;
}

const HORIZON = 0.45;
const TRUNK = "#7A5236";
const TRUNK_DARK = "#5E3E28";

const SKY: Record<SkyPhase, [string, string]> = {
  dawn: ["#F6C3A5", "#FDEBD8"],
  day: ["#9FD3F0", "#E6F4FB"],
  dusk: ["#E68B76", "#F8D1B5"],
  night: ["#0F1F38", "#2B4467"],
};

const HILLS: Record<Season, [string, string]> = {
  spring: ["#A9D6B0", "#86C08F"],
  summer: ["#A3CF9A", "#7DB874"],
  autumn: ["#CDC898", "#B4B27A"],
  winter: ["#DCE4E0", "#C5D1CB"],
};

const MEADOW: Record<Season, [string, string]> = {
  spring: ["#B6DE9C", "#86C672"],
  summer: ["#C3DF94", "#8FC067"],
  autumn: ["#C6CF92", "#9EAF69"],
  winter: ["#F1F4F2", "#D9E2DD"],
};

const CANOPY: Record<TreeSpecies, Record<Season, string>> = {
  oak: { spring: "#79C27D", summer: "#3F8F52", autumn: "#D9822B", winter: "#9AA79F" },
  pine: { spring: "#2F7A4B", summer: "#2A6B43", autumn: "#2F6B45", winter: "#3A6B50" },
  birch: { spring: "#A6D46F", summer: "#6FB257", autumn: "#E6B43A", winter: "#B4BDB7" },
  blossom: { spring: "#F4A7C0", summer: "#58A160", autumn: "#C8553D", winter: "#B4BDB7" },
};

/** Mix a hex colour with black (amount < 0) or white (amount > 0). */
function tint(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const target = amount > 0 ? 255 : 0;
    return Math.round(c + (target - c) * Math.abs(amount));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function shadow(x: number, y: number, s: number, key: string) {
  return <Ellipse key={key} cx={x} cy={y} rx={s * 0.34} ry={s * 0.07} fill="rgba(16,43,25,0.14)" />;
}

function fullTree(
  species: TreeSpecies,
  season: Season,
  x: number,
  y: number,
  s: number,
  key: string,
): ReactElement {
  const leaf = CANOPY[species][season];
  const dark = tint(leaf, -0.18);
  const light = tint(leaf, 0.22);
  const snow = season === "winter";

  if (species === "pine") {
    const tiers: Array<[number, number, number]> = [
      [0.75, 0.18, 0.56],
      [1.05, 0.42, 0.48],
      [1.35, 0.75, 0.38],
    ];
    return (
      <G key={key}>
        {shadow(x, y, s, `${key}-s`)}
        <Rect x={x - s * 0.05} y={y - s * 0.3} width={s * 0.1} height={s * 0.3} fill={TRUNK_DARK} />
        {tiers.map(([top, base, half], i) => (
          <G key={`${key}-t${i}`}>
            <Polygon
              points={`${x},${y - s * top} ${x - s * half},${y - s * base} ${x + s * half},${y - s * base}`}
              fill={i % 2 === 0 ? leaf : dark}
            />
            {snow ? (
              <Polygon
                points={`${x},${y - s * top} ${x - s * half * 0.35},${y - s * (top - 0.18)} ${x + s * half * 0.35},${y - s * (top - 0.18)}`}
                fill="#FFFFFF"
              />
            ) : null}
          </G>
        ))}
      </G>
    );
  }

  if (species === "birch") {
    return (
      <G key={key}>
        {shadow(x, y, s, `${key}-s`)}
        <Rect
          x={x - s * 0.05}
          y={y - s * 0.78}
          width={s * 0.1}
          height={s * 0.78}
          rx={s * 0.03}
          fill="#F1EFE6"
          stroke="#CFCBBE"
          strokeWidth={0.6}
        />
        <Rect x={x - s * 0.05} y={y - s * 0.3} width={s * 0.06} height={s * 0.025} fill="#4A4A44" />
        <Rect x={x - s * 0.01} y={y - s * 0.52} width={s * 0.06} height={s * 0.025} fill="#4A4A44" />
        <Ellipse cx={x} cy={y - s * 1.02} rx={s * 0.3} ry={s * 0.44} fill={leaf} />
        <Ellipse cx={x - s * 0.09} cy={y - s * 1.12} rx={s * 0.13} ry={s * 0.22} fill={light} />
        {snow ? <Ellipse cx={x} cy={y - s * 1.36} rx={s * 0.16} ry={s * 0.07} fill="#FFFFFF" /> : null}
      </G>
    );
  }

  if (species === "blossom") {
    const petals: Array<[number, number, number]> = [
      [0, -1.02, 0.25],
      [-0.25, -0.86, 0.22],
      [0.25, -0.86, 0.22],
      [-0.14, -0.66, 0.2],
      [0.15, -0.66, 0.2],
    ];
    return (
      <G key={key}>
        {shadow(x, y, s, `${key}-s`)}
        <Path
          d={`M${x - s * 0.05},${y} L${x - s * 0.03},${y - s * 0.6} L${x + s * 0.03},${y - s * 0.6} L${x + s * 0.06},${y} Z`}
          fill={TRUNK}
        />
        {petals.map(([dx, dy, r], i) => (
          <Circle key={`${key}-p${i}`} cx={x + s * dx} cy={y + s * dy} r={s * r} fill={i % 2 ? dark : leaf} />
        ))}
        {season === "spring"
          ? [
              [-0.12, -1.05],
              [0.18, -0.92],
              [-0.2, -0.74],
              [0.08, -0.7],
            ].map(([dx, dy], i) => (
              <Circle key={`${key}-f${i}`} cx={x + s * (dx ?? 0)} cy={y + s * (dy ?? 0)} r={s * 0.04} fill="#FFFFFF" />
            ))
          : null}
        {snow ? <Ellipse cx={x} cy={y - s * 1.22} rx={s * 0.18} ry={s * 0.07} fill="#FFFFFF" /> : null}
      </G>
    );
  }

  // oak
  return (
    <G key={key}>
      {shadow(x, y, s, `${key}-s`)}
      <Rect x={x - s * 0.06} y={y - s * 0.56} width={s * 0.12} height={s * 0.56} rx={s * 0.03} fill={TRUNK} />
      <Circle cx={x - s * 0.26} cy={y - s * 0.72} r={s * 0.27} fill={dark} />
      <Circle cx={x + s * 0.27} cy={y - s * 0.74} r={s * 0.28} fill={leaf} />
      <Circle cx={x} cy={y - s * 0.97} r={s * 0.38} fill={leaf} />
      <Circle cx={x - s * 0.1} cy={y - s * 1.1} r={s * 0.17} fill={light} />
      {snow ? <Ellipse cx={x} cy={y - s * 1.3} rx={s * 0.22} ry={s * 0.08} fill="#FFFFFF" /> : null}
    </G>
  );
}

function growingTree(
  stage: number,
  species: TreeSpecies,
  season: Season,
  x: number,
  y: number,
  s: number,
  key: string,
): ReactElement {
  const halo = <Circle key={`${key}-h`} cx={x} cy={y - s * 0.35} r={s * 0.62} fill="rgba(255,255,255,0.28)" />;
  const mound = <Ellipse key={`${key}-m`} cx={x} cy={y} rx={s * 0.2} ry={s * 0.075} fill="#8B6B4A" />;
  const green = "#4FA562";

  if (stage === 0) {
    return (
      <G key={key}>
        {halo}
        {mound}
        <Ellipse cx={x} cy={y - s * 0.05} rx={s * 0.06} ry={s * 0.04} fill="#5E3E28" />
        <Path d={`M${x},${y - s * 0.07} q${s * 0.04},${-s * 0.08} ${s * 0.09},${-s * 0.1}`} stroke={green} strokeWidth={s * 0.025} fill="none" />
      </G>
    );
  }
  if (stage === 1) {
    return (
      <G key={key}>
        {halo}
        {mound}
        <Line x1={x} y1={y} x2={x} y2={y - s * 0.32} stroke={green} strokeWidth={s * 0.035} strokeLinecap="round" />
        <Ellipse cx={x - s * 0.08} cy={y - s * 0.3} rx={s * 0.09} ry={s * 0.045} fill={green} rotation={-25} origin={`${x - s * 0.08}, ${y - s * 0.3}`} />
        <Ellipse cx={x + s * 0.08} cy={y - s * 0.34} rx={s * 0.09} ry={s * 0.045} fill="#6CC27D" rotation={25} origin={`${x + s * 0.08}, ${y - s * 0.34}`} />
      </G>
    );
  }
  if (stage === 2) {
    return (
      <G key={key}>
        {halo}
        {mound}
        <Line x1={x} y1={y} x2={x} y2={y - s * 0.2} stroke={TRUNK} strokeWidth={s * 0.05} />
        <Circle cx={x - s * 0.12} cy={y - s * 0.26} r={s * 0.15} fill="#4C9E5E" />
        <Circle cx={x + s * 0.12} cy={y - s * 0.28} r={s * 0.16} fill="#5DB36E" />
        <Circle cx={x} cy={y - s * 0.4} r={s * 0.15} fill="#6CC27D" />
      </G>
    );
  }
  return (
    <G key={key}>
      {halo}
      {fullTree(species, season, x, y, s * (stage === 3 ? 0.62 : 0.85), `${key}-t`)}
    </G>
  );
}

/** A living forest that grows with the CO₂ you avoid (la surprise du chef). */
export function ForestScene({
  co2Kg,
  width,
  height,
  date,
  showWildlife = true,
  maxTrees = 60,
}: ForestSceneProps) {
  const now = date ?? new Date();
  const season = seasonFor(now);
  const phase = skyPhase(now);
  const state = forestState(co2Kg);
  const drawnTrees = Math.min(state.trees, maxTrees);
  const hasGrowing = state.trees < maxTrees;

  const placements = useMemo(
    () => (width > 0 ? layoutForest(drawnTrees + (hasGrowing ? 1 : 0), { width, height, horizon: HORIZON }) : []),
    [drawnTrees, hasGrowing, width, height],
  );

  const stars = useMemo(() => {
    const rng = mulberry32(7);
    return Array.from({ length: 16 }, () => ({ x: rng() * width, y: rng() * height * 0.35, r: 0.6 + rng() * 1.1 }));
  }, [width, height]);

  const wildlife = useMemo(() => {
    if (!showWildlife) return [];
    return wildlifeFor(state.trees).map((w, i) => {
      const rng = mulberry32(1000 + i * 31);
      const flyer = w.icon === "🦋" || w.icon === "🐦";
      return {
        ...w,
        x: width * (0.08 + rng() * 0.8),
        y: flyer ? height * (0.22 + rng() * 0.2) : height * (0.66 + rng() * 0.22),
      };
    });
  }, [showWildlife, state.trees, width, height]);

  if (width <= 0) return <View style={{ height }} />;

  const hz = height * HORIZON;
  const [skyTop, skyBottom] = SKY[phase];
  const [hillFar, hillNear] = HILLS[season];
  const [meadowTop, meadowBottom] = MEADOW[season];
  // Bigger trees while the forest is sparse, denser look as it fills up.
  const unit = height * Math.min(0.34, Math.max(0.2, 0.34 - placements.length * 0.006));

  const renderTree = (p: TreePlacement) => {
    const s = unit * p.scale;
    const key = `tree-${p.index}`;
    if (hasGrowing && p.index === drawnTrees) {
      return growingTree(state.stage, p.species, season, p.x, p.y, s, key);
    }
    return fullTree(p.species, season, p.x, p.y, s, key);
  };

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={skyTop} />
            <Stop offset="1" stopColor={skyBottom} />
          </LinearGradient>
          <LinearGradient id="meadow" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={meadowTop} />
            <Stop offset="1" stopColor={meadowBottom} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#sky)" />

        {phase === "night"
          ? stars.map((st, i) => <Circle key={`star-${i}`} cx={st.x} cy={st.y} r={st.r} fill="#FFFFFF" opacity={0.85} />)
          : null}

        {phase === "night" ? (
          <G>
            <Circle cx={width * 0.82} cy={height * 0.15} r={13} fill="#F3F0DE" />
            <Circle cx={width * 0.82 + 6} cy={height * 0.15 - 4} r={11} fill={skyTop} />
          </G>
        ) : phase === "day" ? (
          <G>
            <Circle cx={width * 0.8} cy={height * 0.16} r={26} fill="#FFE29A" opacity={0.35} />
            <Circle cx={width * 0.8} cy={height * 0.16} r={16} fill="#FFD566" />
            <G opacity={0.92}>
              <Ellipse cx={width * 0.22} cy={height * 0.14} rx={26} ry={9} fill="#FFFFFF" />
              <Ellipse cx={width * 0.27} cy={height * 0.11} rx={16} ry={9} fill="#FFFFFF" />
              <Ellipse cx={width * 0.55} cy={height * 0.22} rx={20} ry={7} fill="#FFFFFF" />
            </G>
          </G>
        ) : (
          <G>
            <Circle cx={width * 0.16} cy={hz - 6} r={30} fill="#FFC48A" opacity={0.35} />
            <Circle cx={width * 0.16} cy={hz - 6} r={18} fill="#FFB067" />
          </G>
        )}

        <Path
          d={`M0 ${hz} Q ${width * 0.22} ${hz - height * 0.13} ${width * 0.45} ${hz - height * 0.02} T ${width} ${hz - height * 0.05} V ${height} H 0 Z`}
          fill={hillFar}
        />
        <Path
          d={`M0 ${hz + height * 0.03} Q ${width * 0.35} ${hz - height * 0.06} ${width * 0.7} ${hz + height * 0.02} T ${width} ${hz} V ${height} H 0 Z`}
          fill={hillNear}
        />
        <Rect x={0} y={hz + height * 0.02} width={width} height={height - hz} fill="url(#meadow)" />

        {placements.map(renderTree)}

        {phase === "night" ? (
          <Rect x={0} y={hz - height * 0.15} width={width} height={height} fill="#0B1830" opacity={0.22} />
        ) : null}
      </Svg>

      {wildlife.map((w) => (
        <Text
          key={w.name}
          style={{ position: "absolute", left: w.x, top: w.y, fontSize: 16 }}
          accessibilityLabel={w.name}
        >
          {w.icon}
        </Text>
      ))}

      {state.trees > maxTrees ? (
        <View className="absolute bottom-2 right-2 rounded-full bg-black/40 px-2 py-0.5">
          <Text className="text-xs font-bold text-white">+{state.trees - maxTrees} arbres</Text>
        </View>
      ) : null}
    </View>
  );
}
