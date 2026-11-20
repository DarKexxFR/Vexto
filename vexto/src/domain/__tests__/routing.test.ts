import {
  bearingDeg,
  cumulativeDistances,
  guidanceFor,
  hasArrived,
  isOffRoute,
  maneuverGlyph,
  metersBetween,
  pickAnnouncement,
  projectOnLine,
  remainingMinutes,
  stepStarts,
  type LngLat,
} from "../navigation";
import {
  buildModeOptions,
  recommendedOption,
  transitDurationMin,
  type RoutedPath,
  type RouteStep,
} from "../routing";
import { coachAdvice, describeWeather, type WeatherNow } from "../weather";

function path(profile: RoutedPath["profile"], km: number, min: number): RoutedPath {
  return {
    profile,
    distanceKm: km,
    durationMin: min,
    geometry: { type: "LineString", coordinates: [[2.3, 48.8], [2.4, 48.8]] },
    steps: [],
  };
}

const CITY_TRIP = {
  "driving-traffic": path("driving-traffic", 6.5, 22),
  cycling: path("cycling", 6.1, 24),
  walking: path("walking", 5.8, 72),
};

describe("buildModeOptions", () => {
  it("builds one option per mode with per-mode distances", () => {
    const options = buildModeOptions(CITY_TRIP);
    expect(options).toHaveLength(5);
    const bike = options.find((o) => o.mode === "bike");
    expect(bike?.distanceKm).toBe(6.1);
    expect(bike?.durationMin).toBe(24);
    expect(bike?.durationEstimated).toBe(false);
    const transit = options.find((o) => o.mode === "publicTransit");
    expect(transit?.durationEstimated).toBe(true);
    expect(transit?.points).toBeGreaterThan(0);
    expect(options.find((o) => o.mode === "carThermal")?.points).toBe(0);
  });

  it("tags fastest / greenest / recommended and puts the car last", () => {
    const options = buildModeOptions(CITY_TRIP);
    expect(options.find((o) => o.tags.includes("fastest"))?.mode).toBe("eScooter");
    expect(options.find((o) => o.tags.includes("greenest"))?.mode).toBe("bike");
    expect(recommendedOption(options)?.mode).toBe("eScooter");
    expect(options[0]?.tags).toContain("recommended");
    expect(options[options.length - 1]?.mode).toBe("carThermal");
  });

  it("avoids soft modes when the weather is bad", () => {
    const options = buildModeOptions(CITY_TRIP, {
      weather: { badForSoftModes: true, reason: "Pluie" },
    });
    expect(recommendedOption(options)?.mode).toBe("publicTransit");
    expect(options.find((o) => o.mode === "bike")?.note).toContain("Pluie");
  });

  it("flags unrealistic walking distances and never recommends them", () => {
    const options = buildModeOptions({
      "driving-traffic": path("driving-traffic", 40, 45),
      cycling: path("cycling", 38, 150),
      walking: path("walking", 36, 460),
    });
    const walk = options.find((o) => o.mode === "walk");
    expect(walk?.feasibility).toBe("unrealistic");
    expect(walk?.tags).toHaveLength(0);
    expect(recommendedOption(options)?.mode).toBe("publicTransit");
  });

  it("suggests shared vehicles when the user owns none", () => {
    const options = buildModeOptions(CITY_TRIP, { owned: { bike: false, eScooter: false } });
    expect(options.find((o) => o.mode === "bike")?.note).toContain("libre-service");
  });

  it("falls back to estimates when only one profile is available", () => {
    const options = buildModeOptions({ cycling: path("cycling", 4, 16) });
    expect(options).toHaveLength(5);
    expect(options.find((o) => o.mode === "walk")?.durationEstimated).toBe(true);
    expect(buildModeOptions({})).toHaveLength(0);
  });

  it("uses real transit timetables when available", () => {
    const options = buildModeOptions(CITY_TRIP, {
      transit: { durationMin: 14, distanceKm: 5.9, summary: "RER A à 08:42 · 1 corresp.", path: null },
    });
    const transit = options.find((o) => o.mode === "publicTransit");
    expect(transit?.durationMin).toBe(14);
    expect(transit?.durationEstimated).toBe(false);
    expect(transit?.distanceKm).toBe(5.9);
    expect(transit?.note).toContain("RER A à 08:42");
    expect(recommendedOption(options)?.mode).toBe("publicTransit");
  });

  it("estimates transit time monotonically", () => {
    let prev = 0;
    for (let km = 0; km <= 80; km += 0.5) {
      const t = transitDurationMin(km);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(transitDurationMin(0)).toBe(8);
  });
});

// A simple L-shaped route: east along 48.85 then north.
const LINE: LngLat[] = [
  [2.3, 48.85],
  [2.31, 48.85],
  [2.31, 48.86],
];

describe("navigation geometry", () => {
  it("measures distances and bearings", () => {
    expect(metersBetween([2.3, 48.85], [2.31, 48.85])).toBeCloseTo(731.7, 0);
    expect(bearingDeg([2.3, 48.85], [2.31, 48.85])).toBeCloseTo(90, 0);
    expect(bearingDeg([2.31, 48.85], [2.31, 48.86])).toBeCloseTo(0, 0);
    const cum = cumulativeDistances(LINE);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeCloseTo(731.7 + 1111.9, -1);
  });

  it("projects a point on the route", () => {
    const p = projectOnLine([2.305, 48.8502], LINE);
    expect(p?.segmentIndex).toBe(0);
    expect(p?.distanceM).toBeCloseTo(22.2, 0);
    expect(p?.alongM).toBeCloseTo(366, -1);
    const q = projectOnLine([2.3102, 48.855], LINE);
    expect(q?.segmentIndex).toBe(1);
    expect(q?.alongM).toBeGreaterThan(732);
  });

  it("finds the next maneuver and the distance to it", () => {
    const steps = [
      { distanceM: 733, maneuverType: "depart" },
      { distanceM: 1112, maneuverType: "turn", modifier: "left" },
      { distanceM: 0, maneuverType: "arrive" },
    ].map(
      (s, i): RouteStep => ({
        instruction: `step ${i}`,
        maneuverType: s.maneuverType,
        modifier: s.modifier ?? null,
        name: "",
        distanceM: s.distanceM,
        durationS: 0,
        location: [0, 0],
        voice: [],
        exit: null,
      }),
    );
    const starts = stepStarts(steps);
    expect(starts).toEqual([0, 733, 1845]);
    const g = guidanceFor(500, steps, starts, 1845);
    expect(g.stepIndex).toBe(0);
    expect(g.next?.instruction).toBe("step 1");
    expect(g.distanceToNextM).toBe(233);
    const g2 = guidanceFor(1000, steps, starts, 1845);
    expect(g2.next?.maneuverType).toBe("arrive");
    expect(g2.remainingM).toBe(845);
    expect(maneuverGlyph(steps[1]!)).toBe("left");
    expect(maneuverGlyph(steps[2]!)).toBe("arrive");
  });

  it("picks the most relevant voice announcement once", () => {
    const voice = [
      { distanceAlongM: 700, announcement: "Dirigez-vous vers l'est" },
      { distanceAlongM: 400, announcement: "Dans 400 mètres, tournez à gauche" },
      { distanceAlongM: 60, announcement: "Tournez à gauche" },
    ];
    const first = pickAnnouncement(0, 690, voice, new Set());
    expect(first?.text).toBe("Dirigez-vous vers l'est");
    const spoken = new Set(first?.keys);
    expect(pickAnnouncement(0, 600, voice, spoken)).toBeNull();
    // GPS gap: both the 400 m and 60 m announcements are due → only the last.
    const late = pickAnnouncement(0, 50, voice, spoken);
    expect(late?.text).toBe("Tournez à gauche");
    expect(late?.keys).toEqual(["0:1", "0:2"]);
  });

  it("detects off-route, arrival and remaining time", () => {
    expect(isOffRoute(20, 10)).toBe(false);
    expect(isOffRoute(55, 10)).toBe(true);
    expect(isOffRoute(55, 60)).toBe(false);
    expect(hasArrived(20, 400)).toBe(true);
    expect(hasArrived(50, 10)).toBe(true);
    expect(hasArrived(200, 10)).toBe(false);
    expect(remainingMinutes(3000, 6, 24)).toBeCloseTo(12, 6);
  });
});

describe("weather coach", () => {
  const base: WeatherNow = {
    temperatureC: 18,
    apparentC: 18,
    precipitationMm: 0,
    weatherCode: 1,
    windKmh: 10,
    isDay: true,
    rainChanceNext3h: 10,
  };

  it("recommends the bike in nice weather", () => {
    const a = coachAdvice(base);
    expect(a.mode).toBe("bike");
    expect(a.tone).toBe("great");
    expect(a.badForSoftModes).toBe(false);
  });

  it("recommends transit when it rains, freezes, or storms", () => {
    expect(coachAdvice({ ...base, weatherCode: 63, precipitationMm: 2 }).mode).toBe("publicTransit");
    expect(coachAdvice({ ...base, rainChanceNext3h: 80 }).badForSoftModes).toBe(true);
    expect(coachAdvice({ ...base, apparentC: -3 }).reason).toBe("Gel");
    expect(coachAdvice({ ...base, weatherCode: 95 }).title).toContain("Orage");
    expect(coachAdvice({ ...base, windKmh: 60 }).reason).toBe("Vent fort");
  });

  it("labels WMO codes in French", () => {
    expect(describeWeather(0).label).toBe("Ciel dégagé");
    expect(describeWeather(0, false).emoji).toBe("🌙");
    expect(describeWeather(81).label).toBe("Averses");
  });
});
