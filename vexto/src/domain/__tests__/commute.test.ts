import { defaultCommuteDirection, leaveLabel } from "@/domain/commute";

describe("commute", () => {
  it("goes to work on weekday mornings, home otherwise", () => {
    expect(defaultCommuteDirection(new Date(2026, 10, 20, 8, 0))).toBe("toWork"); // Friday 8:00
    expect(defaultCommuteDirection(new Date(2026, 10, 20, 18, 0))).toBe("toHome");
    expect(defaultCommuteDirection(new Date(2026, 10, 21, 9, 0))).toBe("toHome"); // Saturday
  });

  it("formats when to leave", () => {
    expect(leaveLabel(-1)).toBe("Partez maintenant");
    expect(leaveLabel(6)).toBe("Partez dans 6 min");
    expect(leaveLabel(65)).toBe("Partez dans 1 h 05");
  });
});
