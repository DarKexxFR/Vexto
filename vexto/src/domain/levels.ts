/**
 * Player levels, driven by lifetime points (1 point = 100 g of CO₂e avoided).
 * Thresholds grow roughly ×2 so early levels come quickly and later ones stay
 * aspirational.
 */
export interface Level {
  index: number;
  name: string;
  icon: string;
  minPoints: number;
}

export const LEVELS: readonly Level[] = [
  { index: 0, name: "Graine", icon: "🌱", minPoints: 0 },
  { index: 1, name: "Pousse", icon: "🌿", minPoints: 100 },
  { index: 2, name: "Jeune arbre", icon: "🪴", minPoints: 300 },
  { index: 3, name: "Arbre", icon: "🌳", minPoints: 750 },
  { index: 4, name: "Bosquet", icon: "🌲", minPoints: 1500 },
  { index: 5, name: "Forêt", icon: "🏞️", minPoints: 3000 },
  { index: 6, name: "Gardien de la forêt", icon: "🦉", minPoints: 6000 },
  { index: 7, name: "Légende Vexto", icon: "🌍", minPoints: 12000 },
];

export interface LevelProgress {
  current: Level;
  next: Level | null;
  /** 0..1 progress from the current level threshold to the next one. */
  progress: number;
  pointsToNext: number;
}

export function levelForPoints(points: number): LevelProgress {
  const p = Math.max(0, Number.isFinite(points) ? points : 0);
  let current: Level = LEVELS[0] as Level;
  for (const level of LEVELS) {
    if (p >= level.minPoints) current = level;
  }
  const next = LEVELS[current.index + 1] ?? null;
  if (!next) return { current, next: null, progress: 1, pointsToNext: 0 };
  const span = next.minPoints - current.minPoints;
  return {
    current,
    next,
    progress: Math.min(1, Math.max(0, (p - current.minPoints) / span)),
    pointsToNext: Math.max(0, Math.ceil(next.minPoints - p)),
  };
}
