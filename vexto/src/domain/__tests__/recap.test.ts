import { monthLabel, monthRecap, recapMonths, recapShareText } from "@/domain/recap";
import type { TripLike } from "@/domain/stats";

const t = (mode: TripLike["mode"], at: Date, km: number, co2: number, status: TripLike["status"] = "verified"): TripLike => ({
  mode,
  distance_km: km,
  co2_saved_kg: co2,
  points_awarded: Math.round(co2 * 10),
  status,
  created_at: at.toISOString(),
});

const TRIPS = [
  t("bike", new Date(2026, 9, 5, 8), 5, 1), // October
  t("bike", new Date(2026, 10, 3, 8), 4, 0.9),
  t("bike", new Date(2026, 10, 3, 18), 4, 0.9),
  t("publicTransit", new Date(2026, 10, 10, 8), 12, 2.5),
  t("carThermal", new Date(2026, 10, 12, 8), 10, 0),
  t("walk", new Date(2026, 10, 14, 8), 1, 0.2, "rejected"),
];

describe("monthly recap", () => {
  it("summarises one month", () => {
    const r = monthRecap(TRIPS, 2026, 10);
    expect(r).toMatchObject({ trips: 4, lowCarbonTrips: 3, km: 30, points: 43, activeDays: 3, favoriteMode: "bike" });
    expect(r.co2Kg).toBeCloseTo(4.3, 6);
    expect(r.greenShare).toBeCloseTo(0.75, 6);
    expect(r.bestDay?.date).toEqual(new Date(2026, 10, 10));
    expect(r.co2ChangePct).toBeCloseTo(330, 6);
    expect(monthLabel(2026, 10)).toBe("novembre 2026");
  });

  it("handles empty months and the previous year", () => {
    const r = monthRecap(TRIPS, 2026, 0);
    expect(r.trips).toBe(0);
    expect(r.favoriteMode).toBeNull();
    expect(r.bestDay).toBeNull();
    expect(r.co2ChangePct).toBeNull();
  });

  it("lists months from the first trip to now", () => {
    expect(recapMonths(TRIPS, new Date(2026, 11, 2))).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 10 },
      { year: 2026, month: 9 },
    ]);
    expect(recapMonths([], new Date(2026, 11, 2))).toEqual([{ year: 2026, month: 11 }]);
  });

  it("builds a share text", () => {
    const text = recapShareText(monthRecap(TRIPS, 2026, 10), () => "Vélo");
    expect(text).toContain("novembre 2026");
    expect(text).toContain("3 trajets verts");
    expect(text).toContain("Mode préféré : Vélo");
  });
});
