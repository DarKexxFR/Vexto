import { equivalencesFor, equivalenceValue, EQUIVALENCES } from "../equivalences";
import {
  forestState,
  KG_PER_TREE,
  layoutForest,
  nextWildlife,
  seasonFor,
  skyPhase,
  wildlifeFor,
} from "../forest";
import { formatChange, formatClock, formatCo2, formatDistance, formatDuration, initials } from "../format";

describe("forestState", () => {
  it("starts with a seed", () => {
    const s = forestState(0);
    expect(s.trees).toBe(0);
    expect(s.stage).toBe(0);
    expect(s.stageName).toBe("Graine");
    expect(s.kgToNextTree).toBe(KG_PER_TREE);
  });

  it("grows one stage every 5 kg and one tree every 25 kg", () => {
    expect(forestState(5).stage).toBe(1);
    expect(forestState(12.5).stageName).toBe("Arbuste");
    const s = forestState(62);
    expect(s.trees).toBe(2);
    expect(s.stage).toBe(2);
    expect(s.kgToNextTree).toBeCloseTo(13, 6);
    expect(s.kgToNextStage).toBeCloseTo(3, 6);
    expect(s.progressInTree).toBeCloseTo(12 / 25, 6);
  });

  it("is robust to floating point accumulation", () => {
    expect(forestState(0.1 * 250).trees).toBe(1);
  });
});

describe("layoutForest", () => {
  it("is deterministic and stable when trees are added", () => {
    const a = layoutForest(8, { width: 320, height: 200 });
    const b = layoutForest(9, { width: 320, height: 200 });
    const byIndex = (list: typeof a) => new Map(list.map((t) => [t.index, t]));
    const ma = byIndex(a);
    const mb = byIndex(b);
    for (let i = 0; i < 8; i += 1) {
      expect(mb.get(i)).toEqual(ma.get(i));
    }
  });

  it("keeps trees inside the meadow, back to front", () => {
    const trees = layoutForest(40, { width: 300, height: 200 });
    expect(trees).toHaveLength(40);
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(300);
      expect(t.y).toBeGreaterThanOrEqual(200 * 0.45);
      expect(t.y).toBeLessThanOrEqual(200);
    }
    for (let i = 1; i < trees.length; i += 1) {
      expect((trees[i]?.y ?? 0) >= (trees[i - 1]?.y ?? 0)).toBe(true);
    }
  });
});

describe("seasons, sky and wildlife", () => {
  it("maps months to seasons", () => {
    expect(seasonFor(new Date(2026, 10, 20))).toBe("autumn");
    expect(seasonFor(new Date(2026, 0, 5))).toBe("winter");
    expect(seasonFor(new Date(2026, 3, 1))).toBe("spring");
    expect(seasonFor(new Date(2026, 6, 14))).toBe("summer");
  });

  it("maps hours to sky phases", () => {
    expect(skyPhase(new Date(2026, 0, 1, 7))).toBe("dawn");
    expect(skyPhase(new Date(2026, 0, 1, 13))).toBe("day");
    expect(skyPhase(new Date(2026, 0, 1, 19))).toBe("dusk");
    expect(skyPhase(new Date(2026, 0, 1, 2))).toBe("night");
  });

  it("brings animals back as the forest grows", () => {
    expect(wildlifeFor(0)).toHaveLength(0);
    expect(wildlifeFor(5).map((w) => w.name)).toContain("Écureuil");
    expect(nextWildlife(5)?.name).toBe("Hérisson");
  });
});

describe("equivalences", () => {
  it("converts kg into tangible units", () => {
    const beef = EQUIVALENCES.find((e) => e.id === "beef_meal");
    expect(beef).toBeDefined();
    const v = equivalenceValue(beef!, 14.52);
    expect(v.value).toBe("2");
    expect(v.label).toBe("repas avec du bœuf");
  });

  it("always returns the car-km equivalence and prefers whole units", () => {
    const small = equivalencesFor(2, 3);
    expect(small).toHaveLength(3);
    expect(small.some((v) => v.equivalence.id === "car_km")).toBe(true);

    const big = equivalencesFor(120, 3);
    expect(big[0]?.equivalence.id).toBe("paris_lyon");
    expect(big.every((v) => v.count >= 1)).toBe(true);
  });
});

describe("format", () => {
  const clean = (s: string) => s.replace(/ /g, " ");

  it("formats CO₂ with adaptive precision", () => {
    expect(clean(formatCo2(0.45))).toBe("450 g");
    expect(clean(formatCo2(2.08))).toBe("2,08 kg");
    expect(clean(formatCo2(28.44))).toBe("28,4 kg");
    expect(clean(formatCo2(1520))).toBe("1,52 t");
  });

  it("formats distances, durations and clocks", () => {
    expect(clean(formatDistance(0.347))).toBe("350 m");
    expect(clean(formatDistance(3.24))).toBe("3,2 km");
    expect(clean(formatDuration(42.4))).toBe("42 min");
    expect(clean(formatDuration(119.8))).toBe("2 h 00");
    expect(clean(formatDuration(75))).toBe("1 h 15");
    expect(formatClock(245)).toBe("4:05");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("formats changes and initials", () => {
    expect(clean(formatChange(35.2))).toBe("+35 %");
    expect(clean(formatChange(-12))).toBe("−12 %");
    expect(initials("Inès  Martin")).toBe("IM");
    expect(initials("")).toBe("V");
  });
});
