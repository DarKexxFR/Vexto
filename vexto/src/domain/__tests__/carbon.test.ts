import {
  NET_SAVING_FACTOR_TRANSIT,
  co2SavedKg,
  emissionsForMode,
  evaluateMode,
  pointsForTrip,
  pointsFromSavedKg,
} from "../carbon";

describe("carbon domain logic (ADEME)", () => {
  it("uses the official net saving factor (0.208 kg/km)", () => {
    expect(NET_SAVING_FACTOR_TRANSIT).toBeCloseTo(0.208, 6);
  });

  it("computes emissions per mode", () => {
    expect(emissionsForMode("carThermal", 10)).toBeCloseTo(2.18, 6);
    expect(emissionsForMode("publicTransit", 10)).toBeCloseTo(0.1, 6);
    expect(emissionsForMode("bike", 10)).toBe(0);
  });

  it("computes CO2 saved vs the car baseline", () => {
    expect(co2SavedKg("publicTransit", 10)).toBeCloseTo(2.08, 6);
    expect(co2SavedKg("bike", 10)).toBeCloseTo(2.18, 6);
    // taking the car vs the car saves nothing
    expect(co2SavedKg("carThermal", 10)).toBe(0);
  });

  it("never returns negative savings", () => {
    expect(co2SavedKg("publicTransit", -5)).toBe(0);
    expect(pointsFromSavedKg(-3)).toBe(0);
  });

  it("applies the 1 point = 100 g rule (transit ≈ distance × 2.08)", () => {
    // 10 km transit => 2.08 kg saved => 20.8 g-units => 21 points (rounded)
    expect(pointsForTrip("publicTransit", 10)).toBe(21);
    // 50 km transit => 10.4 kg => 104 points
    expect(pointsForTrip("publicTransit", 50)).toBe(104);
  });

  it("evaluateMode returns a full coherent breakdown", () => {
    const outcome = evaluateMode("publicTransit", 25);
    expect(outcome.mode).toBe("publicTransit");
    expect(outcome.emissionsKg).toBeCloseTo(0.25, 6);
    expect(outcome.co2SavedKg).toBeCloseTo(5.2, 6);
    expect(outcome.points).toBe(52);
  });
});
