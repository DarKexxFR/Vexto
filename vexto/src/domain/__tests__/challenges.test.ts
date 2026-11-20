import { CHALLENGES, challengesOfWeek, daysLeftInWeek, evaluateChallenges, weekIndex, weekStart } from "@/domain/challenges";
import type { TripLike } from "@/domain/stats";

const trip = (mode: TripLike["mode"], at: Date, km = 3, co2 = 0.6, status: TripLike["status"] = "verified"): TripLike => ({
  mode,
  distance_km: km,
  co2_saved_kg: co2,
  points_awarded: 6,
  status,
  created_at: at.toISOString(),
});

describe("weekly challenges", () => {
  const friday = new Date(2026, 10, 20, 18, 0); // Friday 20 Nov 2026

  it("starts weeks on Monday", () => {
    expect(weekStart(friday)).toEqual(new Date(2026, 10, 16));
    expect(weekStart(new Date(2026, 10, 22, 23))).toEqual(new Date(2026, 10, 16)); // Sunday
    expect(weekIndex(new Date(2026, 10, 23))).toBe(weekIndex(friday) + 1);
    expect(daysLeftInWeek(friday)).toBe(3);
  });

  it("picks three distinct challenges that rotate weekly", () => {
    const seen = new Set<string>();
    for (let w = 0; w < CHALLENGES.length; w += 1) {
      const picks = challengesOfWeek(new Date(2026, 0, 5 + 7 * w));
      expect(new Set(picks.map((p) => p.id)).size).toBe(3);
      picks.forEach((p) => seen.add(p.id));
    }
    expect(seen.size).toBe(CHALLENGES.length);
    expect(challengesOfWeek(friday).map((c) => c.id)).toEqual(challengesOfWeek(new Date(2026, 10, 16, 7)).map((c) => c.id));
  });

  it("measures progress on this week's verified trips only", () => {
    const trips = [
      trip("bike", new Date(2026, 10, 17, 8)),
      trip("bike", new Date(2026, 10, 18, 8)),
      trip("bike", new Date(2026, 10, 19, 8), 3, 0.6, "rejected"),
      trip("bike", new Date(2026, 10, 10, 8)), // last week
      trip("publicTransit", new Date(2026, 10, 20, 8), 10, 2),
    ];
    const pool = evaluateChallenges(trips, friday);
    expect(pool).toHaveLength(3);
    const all = CHALLENGES.map((c) => ({ id: c.id, v: c.metric(trips.slice(0, 2).concat(trips[4]!)) }));
    expect(all.find((x) => x.id === "bike3")?.v).toBe(2);
    expect(all.find((x) => x.id === "green20")?.v).toBe(16);
    expect(all.find((x) => x.id === "days4")?.v).toBe(3);
    expect(all.find((x) => x.id === "early2")?.v).toBe(3);
    for (const c of pool) {
      expect(c.progress).toBeGreaterThanOrEqual(0);
      expect(c.progress).toBeLessThanOrEqual(1);
      expect(c.done).toBe(c.value >= c.target);
    }
  });
});
