import { evaluateAchievements, newlyUnlocked } from "../achievements";
import { levelForPoints, LEVELS } from "../levels";
import {
  computeStreak,
  dailySeries,
  summarizeTrips,
  weekOverWeek,
  type TripLike,
} from "../stats";
import type { TripMode, TripStatus } from "@/types/database";

const NOW = new Date(2026, 10, 20, 18, 0); // Fri 20 Nov 2026, 18:00 local

function trip(
  daysAgo: number,
  mode: TripMode,
  km: number,
  opts: { status?: TripStatus; hour?: number; co2?: number; points?: number } = {},
): TripLike {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, opts.hour ?? 9, 30);
  const co2 = opts.co2 ?? (mode === "carThermal" ? 0 : km * 0.2);
  return {
    mode,
    distance_km: km,
    co2_saved_kg: co2,
    points_awarded: opts.points ?? Math.round(co2 * 10),
    status: opts.status ?? "verified",
    created_at: d.toISOString(),
  };
}

describe("levels", () => {
  it("starts at Graine and progresses toward Pousse", () => {
    const p = levelForPoints(50);
    expect(p.current.name).toBe("Graine");
    expect(p.next?.name).toBe("Pousse");
    expect(p.progress).toBeCloseTo(0.5, 6);
    expect(p.pointsToNext).toBe(50);
  });

  it("handles exact thresholds and the last level", () => {
    expect(levelForPoints(100).current.name).toBe("Pousse");
    const top = levelForPoints(1_000_000);
    expect(top.current.index).toBe(LEVELS.length - 1);
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
  });

  it("never breaks on bad input", () => {
    expect(levelForPoints(-10).current.name).toBe("Graine");
    expect(levelForPoints(Number.NaN).current.name).toBe("Graine");
  });
});

describe("summarizeTrips", () => {
  it("only counts verified trips and aggregates per mode", () => {
    const s = summarizeTrips([
      trip(0, "bike", 10),
      trip(1, "publicTransit", 20),
      trip(1, "publicTransit", 5, { status: "rejected", co2: 0, points: 0 }),
      trip(2, "carThermal", 15),
      trip(3, "walk", 2, { status: "pending" }),
    ]);
    expect(s.totalTrips).toBe(5);
    expect(s.verifiedTrips).toBe(3);
    expect(s.rejectedTrips).toBe(1);
    expect(s.lowCarbonTrips).toBe(2);
    expect(s.totalKm).toBeCloseTo(45, 6);
    expect(s.co2Kg).toBeCloseTo(6, 6);
    expect(s.byMode.publicTransit.count).toBe(1);
    expect(s.byMode.bike.km).toBe(10);
    expect(s.longestTripKm).toBe(20);
    expect(s.modesUsed).toBe(2);
  });

  it("accepts numeric strings from PostgREST", () => {
    const t = { ...trip(0, "bike", 0), distance_km: "3.5", co2_saved_kg: "0.763", points_awarded: "8" };
    const s = summarizeTrips([t]);
    expect(s.totalKm).toBeCloseTo(3.5, 6);
    expect(s.points).toBe(8);
  });

  it("picks the most used low-carbon mode as favourite", () => {
    const s = summarizeTrips([trip(0, "bike", 1), trip(1, "walk", 1), trip(2, "walk", 1)]);
    expect(s.favoriteMode).toBe("walk");
  });
});

describe("dailySeries / weekOverWeek", () => {
  it("returns 7 days ending today with verified CO₂", () => {
    const series = dailySeries([trip(0, "bike", 10), trip(0, "walk", 5), trip(6, "bike", 1), trip(7, "bike", 50)], 7, NOW);
    expect(series).toHaveLength(7);
    expect(series[6]?.isToday).toBe(true);
    expect(series[6]?.co2Kg).toBeCloseTo(3, 6);
    expect(series[6]?.trips).toBe(2);
    expect(series[0]?.co2Kg).toBeCloseTo(0.2, 6);
    expect(series[6]?.letter).toBe("V");
  });

  it("compares the last 7 days with the 7 before", () => {
    const w = weekOverWeek([trip(0, "bike", 10), trip(8, "bike", 5)], NOW);
    expect(w.thisWeekKg).toBeCloseTo(2, 6);
    expect(w.lastWeekKg).toBeCloseTo(1, 6);
    expect(w.changePct).toBeCloseTo(100, 6);
    expect(weekOverWeek([trip(0, "bike", 10)], NOW).changePct).toBeNull();
  });
});

describe("computeStreak", () => {
  it("counts consecutive days including today", () => {
    const s = computeStreak([trip(0, "bike", 1), trip(1, "walk", 1), trip(2, "bike", 1), trip(4, "bike", 1)], NOW);
    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(true);
    expect(s.best).toBe(3);
  });

  it("keeps the streak alive until the end of today", () => {
    const s = computeStreak([trip(1, "bike", 1), trip(2, "bike", 1)], NOW);
    expect(s.activeToday).toBe(false);
    expect(s.current).toBe(2);
  });

  it("ignores car and rejected trips, and finds the best past run", () => {
    const s = computeStreak(
      [
        trip(0, "carThermal", 10),
        trip(1, "bike", 1, { status: "rejected" }),
        trip(10, "bike", 1),
        trip(11, "bike", 1),
        trip(12, "bike", 1),
        trip(13, "bike", 1),
      ],
      NOW,
    );
    expect(s.current).toBe(0);
    expect(s.best).toBe(4);
  });
});

describe("achievements", () => {
  it("unlocks based on history and reports new unlocks", () => {
    const trips = [trip(0, "bike", 30), trip(1, "bike", 25)];
    const ctx = (t: TripLike[]) => ({ summary: summarizeTrips(t), streak: computeStreak(t, NOW), trips: t });
    const before = evaluateAchievements(ctx(trips.slice(0, 1)));
    const after = evaluateAchievements(ctx(trips));
    const firstTrip = after.find((a) => a.id === "first_trip");
    expect(firstTrip?.unlocked).toBe(true);
    expect(after.find((a) => a.id === "bike_50")?.unlocked).toBe(true);
    expect(before.find((a) => a.id === "bike_50")?.unlocked).toBe(false);
    const fresh = newlyUnlocked(before, after).map((a) => a.id);
    expect(fresh).toContain("bike_50");
    expect(fresh).not.toContain("first_trip");
  });

  it("tracks time-of-day badges", () => {
    const t = [trip(0, "walk", 1, { hour: 6 }), trip(1, "walk", 1, { hour: 23 })];
    const states = evaluateAchievements({ summary: summarizeTrips(t), streak: computeStreak(t, NOW), trips: t });
    expect(states.find((a) => a.id === "early_bird")?.unlocked).toBe(true);
    expect(states.find((a) => a.id === "night_owl")?.unlocked).toBe(true);
  });
});
