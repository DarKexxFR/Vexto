/**
 * "Ma Forêt Vexto" — the chef's surprise. Every kilogram of CO₂ avoided makes a
 * virtual forest grow. One tree = 25 kg of CO₂e, roughly what a tree absorbs in
 * a year, and each tree grows through five visible stages (one every 5 kg) so
 * progress shows after almost every trip.
 */

export const KG_PER_TREE = 25;

export const GROWTH_STAGES = [
  "Graine",
  "Pousse",
  "Arbuste",
  "Jeune arbre",
  "Arbre adulte",
] as const;

const KG_PER_STAGE = KG_PER_TREE / GROWTH_STAGES.length;

export interface ForestState {
  /** Fully grown trees. */
  trees: number;
  /** Growth stage (0..4) of the tree currently growing. */
  stage: number;
  stageName: string;
  /** 0..1 progress of the growing tree. */
  progressInTree: number;
  kgToNextTree: number;
  kgToNextStage: number;
}

export function forestState(co2Kg: number): ForestState {
  const kg = Math.max(0, Number.isFinite(co2Kg) ? co2Kg : 0);
  const trees = Math.floor(kg / KG_PER_TREE + 1e-9);
  const remainder = Math.max(0, kg - trees * KG_PER_TREE);
  const stage = Math.min(GROWTH_STAGES.length - 1, Math.floor(remainder / KG_PER_STAGE + 1e-9));
  return {
    trees,
    stage,
    stageName: GROWTH_STAGES[stage] ?? GROWTH_STAGES[0],
    progressInTree: remainder / KG_PER_TREE,
    kgToNextTree: KG_PER_TREE - remainder,
    kgToNextStage: (stage + 1) * KG_PER_STAGE - remainder,
  };
}

export type Season = "spring" | "summer" | "autumn" | "winter";

/** Northern-hemisphere meteorological seasons. */
export function seasonFor(date: Date): Season {
  const m = date.getMonth(); // 0 = January
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Printemps",
  summer: "Été",
  autumn: "Automne",
  winter: "Hiver",
};

export type SkyPhase = "dawn" | "day" | "dusk" | "night";

export function skyPhase(date: Date): SkyPhase {
  const h = date.getHours();
  if (h >= 6 && h < 8) return "dawn";
  if (h >= 8 && h < 18) return "day";
  if (h >= 18 && h < 21) return "dusk";
  return "night";
}

export type TreeSpecies = "oak" | "pine" | "birch" | "blossom";

export interface TreePlacement {
  index: number;
  /** Trunk base position, in the scene's coordinate space. */
  x: number;
  y: number;
  /** Size multiplier (perspective: further back = smaller). */
  scale: number;
  species: TreeSpecies;
}

/** Small deterministic PRNG so a forest looks the same on every render. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES_CYCLE: readonly TreeSpecies[] = ["oak", "pine", "birch", "oak", "pine", "blossom"];

export interface ForestLayoutOptions {
  width: number;
  height: number;
  /** Top of the planting area (the horizon), as a fraction of height. */
  horizon?: number;
  seed?: number;
}

/**
 * Place `count` trees on the meadow. Placement of tree #i only depends on the
 * trees before it, so planting a new tree never moves the existing ones.
 * Returned in painter's order (back to front).
 */
export function layoutForest(count: number, opts: ForestLayoutOptions): TreePlacement[] {
  const { width, height, horizon = 0.45, seed = 42 } = opts;
  const top = height * horizon;
  const bottom = height * 0.94;
  const margin = width * 0.06;
  const placed: TreePlacement[] = [];

  for (let i = 0; i < count; i += 1) {
    const rng = mulberry32(seed * 1009 + i * 7919);
    const minDist = Math.max(10, (width / Math.sqrt(count + 4)) * 0.55);
    let best: TreePlacement | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const x = margin + rng() * (width - margin * 2);
      const y = top + rng() * (bottom - top);
      const depth = (y - top) / (bottom - top);
      const candidate: TreePlacement = {
        index: i,
        x,
        y,
        scale: 0.5 + depth * 0.65,
        species: SPECIES_CYCLE[Math.floor(rng() * SPECIES_CYCLE.length)] ?? "oak",
      };
      let nearest = Infinity;
      for (const p of placed) {
        nearest = Math.min(nearest, Math.hypot((p.x - x) * 0.8, (p.y - y) * 1.6));
      }
      if (nearest >= minDist) {
        best = candidate;
        break;
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = candidate;
      }
    }
    if (best) placed.push(best);
  }

  return [...placed].sort((a, b) => a.y - b.y);
}

export interface Wildlife {
  minTrees: number;
  icon: string;
  name: string;
}

/** Biodiversity comes back as the forest grows. */
export const WILDLIFE: readonly Wildlife[] = [
  { minTrees: 1, icon: "🐞", name: "Coccinelle" },
  { minTrees: 2, icon: "🦋", name: "Papillon" },
  { minTrees: 3, icon: "🐦", name: "Mésange" },
  { minTrees: 5, icon: "🐿️", name: "Écureuil" },
  { minTrees: 8, icon: "🦔", name: "Hérisson" },
  { minTrees: 12, icon: "🦊", name: "Renard" },
  { minTrees: 20, icon: "🦌", name: "Cerf" },
  { minTrees: 35, icon: "🦉", name: "Chouette" },
  { minTrees: 50, icon: "🐗", name: "Sanglier" },
];

export function wildlifeFor(trees: number): Wildlife[] {
  return WILDLIFE.filter((w) => trees >= w.minTrees);
}

export function nextWildlife(trees: number): Wildlife | null {
  return WILDLIFE.find((w) => trees < w.minTrees) ?? null;
}
