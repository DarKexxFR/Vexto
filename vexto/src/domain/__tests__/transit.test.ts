import {
  cleanName,
  formatWait,
  legInstruction,
  modeKind,
  parseDepartures,
  parseJourneys,
  parseLine,
  parseNavitiaDate,
  parseNearby,
  parseSearch,
  toNavitiaDate,
  transitLegs,
  type NvDeparturesResponse,
  type NvJourneysResponse,
} from "../transit";

const NOW = new Date(2026, 10, 20, 8, 30, 0);

const JOURNEYS: NvJourneysResponse = {
  journeys: [
    {
      duration: 1500,
      nb_transfers: 0,
      departure_date_time: "20261120T084000",
      arrival_date_time: "20261120T090500",
      type: "best",
      status: "",
      co2_emission: { value: 31.2, unit: "gEC" },
      durations: { walking: 540 },
      sections: [
        {
          type: "crow_fly",
          mode: "walking",
          duration: 0,
          from: { name: "2.35;48.85", embedded_type: "address" },
          to: { name: "Rue X", embedded_type: "address" },
        },
        {
          type: "street_network",
          mode: "walking",
          duration: 300,
          departure_date_time: "20261120T084000",
          arrival_date_time: "20261120T084500",
          from: { name: "12 Rue de Rivoli (Paris)", embedded_type: "address", address: { coord: { lon: "2.3522", lat: "48.8566" } } },
          to: { name: "Châtelet les Halles (Paris)", embedded_type: "stop_point", stop_point: { name: "Châtelet les Halles (Paris)", coord: { lon: "2.3470", lat: "48.8619" } } },
          geojson: { type: "LineString", coordinates: [[2.3522, 48.8566], [2.3500, 48.8600], [2.3470, 48.8619]] },
        },
        {
          type: "public_transport",
          duration: 780,
          departure_date_time: "20261120T084800",
          arrival_date_time: "20261120T090100",
          base_departure_date_time: "20261120T084600",
          data_freshness: "realtime",
          from: { embedded_type: "stop_point", stop_point: { name: "Châtelet les Halles (Paris)", coord: { lon: "2.3470", lat: "48.8619" } } },
          to: { embedded_type: "stop_point", stop_point: { name: "Gare de Lyon (Paris)", coord: { lon: "2.3735", lat: "48.8448" } } },
          display_informations: {
            commercial_mode: "RER",
            network: "RER",
            code: "A",
            label: "A",
            color: "E2231A",
            text_color: "FFFFFF",
            direction: "Boissy-Saint-Léger (Boissy-Saint-Léger)",
            links: [{ type: "line", id: "line:IDFM:C01742" }],
          },
          stop_date_times: [
            { stop_point: { name: "Châtelet les Halles (Paris)", coord: { lon: "2.3470", lat: "48.8619" } } },
            { stop_point: { name: "Gare de Lyon (Paris)" } },
          ],
          geojson: { type: "LineString", coordinates: [[2.3470, 48.8619], [2.3735, 48.8448]] },
        },
        {
          type: "street_network",
          mode: "walking",
          duration: 240,
          departure_date_time: "20261120T090100",
          arrival_date_time: "20261120T090500",
          from: { embedded_type: "stop_point", stop_point: { name: "Gare de Lyon (Paris)" } },
          to: { name: "Gare de Lyon", embedded_type: "address" },
          geojson: { type: "LineString", coordinates: [[2.3735, 48.8448], [2.3740, 48.8440]] },
        },
      ],
    },
    {
      // Walking only (Navitia "non_pt" answer): must not appear as transit.
      duration: 7740,
      nb_transfers: 0,
      departure_date_time: "20261120T083000",
      arrival_date_time: "20261120T103900",
      sections: [
        {
          type: "street_network",
          mode: "walking",
          duration: 7740,
          departure_date_time: "20261120T083000",
          arrival_date_time: "20261120T103900",
          from: { name: "Départ", embedded_type: "address" },
          to: { name: "Arrivée", embedded_type: "address" },
        },
      ],
    },
    {
      // Leaves earlier but arrives later than the RER A journey.
      duration: 2700,
      nb_transfers: 1,
      departure_date_time: "20261120T083500",
      arrival_date_time: "20261120T092000",
      sections: [
        {
          type: "public_transport",
          duration: 2400,
          departure_date_time: "20261120T083800",
          arrival_date_time: "20261120T091800",
          from: { embedded_type: "stop_point", stop_point: { name: "Bastille (Paris)" } },
          to: { embedded_type: "stop_point", stop_point: { name: "Nation (Paris)" } },
          display_informations: { commercial_mode: "Bus", code: "87", color: "00814F", text_color: "FFFFFF" },
        },
      ],
    },
  ],
};

describe("dates", () => {
  it("parses Navitia local datetimes both ways", () => {
    const d = parseNavitiaDate("20261120T084830");
    expect(d?.getHours()).toBe(8);
    expect(d?.getMinutes()).toBe(48);
    expect(d?.getSeconds()).toBe(30);
    expect(toNavitiaDate(new Date(2026, 0, 5, 7, 3, 9))).toBe("20260105T070309");
    expect(parseNavitiaDate("garbage")).toBeNull();
  });
});

describe("parseJourneys", () => {
  const journeys = parseJourneys(JOURNEYS);

  it("drops walking-only journeys", () => {
    expect(journeys).toHaveLength(2);
    expect(journeys.every((j) => transitLegs(j).length > 0)).toBe(true);
  });

  it("puts the journey that arrives first on top", () => {
    expect(journeys.map((j) => j.arrival.getMinutes())).toEqual([5, 20]);
    expect(journeys[0]?.departure.getMinutes()).toBe(40);
  });

  it("builds walk + RER legs with official colors and realtime delay", () => {
    const j = journeys.find((x) => x.departure.getMinutes() === 40)!;
    expect(j.durationMin).toBe(25);
    expect(j.walkingMin).toBe(9);
    expect(j.co2Grams).toBeCloseTo(31.2, 6);
    expect(j.legs.map((l) => l.type)).toEqual(["walk", "transit", "walk"]);
    const rer = transitLegs(j)[0]!;
    expect(rer.line?.kind).toBe("rer");
    expect(rer.line?.code).toBe("A");
    expect(rer.line?.color).toBe("#E2231A");
    expect(rer.line?.id).toBe("line:IDFM:C01742");
    expect(rer.direction).toBe("Boissy-Saint-Léger");
    expect(rer.from).toBe("Châtelet les Halles");
    expect(rer.stopList).toEqual([
      { name: "Châtelet les Halles", coords: [2.347, 48.8619] },
      { name: "Gare de Lyon", coords: null },
    ]);
    expect(rer.realtime).toBe(true);
    expect(rer.delayMin).toBe(2);
    expect(j.distanceKm).toBeGreaterThan(2.5);
    expect(legInstruction(rer)).toBe("Prenez le RER A direction Boissy-Saint-Léger à Châtelet les Halles");
    expect(legInstruction(j.legs[0]!)).toBe("Marchez jusqu'à Châtelet les Halles");
  });

  it("returns nothing for errors or empty payloads", () => {
    expect(parseJourneys({ error: { id: "no_solution" } })).toEqual([]);
  });
});

describe("parseDepartures", () => {
  const raw: NvDeparturesResponse = {
    departures: [
      { display_informations: { commercial_mode: "Bus", code: "38", color: "0064B0", direction: "Porte d'Orléans (Paris)", links: [{ type: "line", id: "line:IDFM:C01077" }] }, stop_date_time: { departure_date_time: "20261120T084500", base_departure_date_time: "20261120T084500", data_freshness: "realtime" } },
      { display_informations: { commercial_mode: "RER", code: "B", color: "5291CE", direction: "Aéroport CDG 2 (Tremblay-en-France)", links: [{ type: "line", id: "line:IDFM:C01743" }] }, stop_date_time: { departure_date_time: "20261120T083400", base_departure_date_time: "20261120T083100", data_freshness: "realtime" } },
      { display_informations: { commercial_mode: "Bus", code: "38", color: "0064B0", direction: "Porte d'Orléans (Paris)", links: [{ type: "line", id: "line:IDFM:C01077" }] }, stop_date_time: { departure_date_time: "20261120T083300", data_freshness: "base_schedule" } },
      { display_informations: { commercial_mode: "Métro", code: "4", direction: "Mairie de Montrouge (Montrouge)" }, stop_date_time: { departure_date_time: "20261120T082000" } },
    ],
  };

  it("groups by line and direction, RER first, times ascending", () => {
    const groups = parseDepartures(raw, NOW);
    expect(groups.map((g) => `${g.line.modeLabel} ${g.line.code}`)).toEqual(["RER B", "Bus 38"]);
    const bus = groups[1]!;
    expect(bus.direction).toBe("Porte d'Orléans");
    expect(bus.times.map((t) => t.at.getMinutes())).toEqual([33, 45]);
    expect(bus.times[0]?.realtime).toBe(false);
    expect(groups[0]?.times[0]?.delayMin).toBe(3);
  });

  it("drops departures already gone", () => {
    expect(parseDepartures(raw, NOW).some((g) => g.line.code === "4")).toBe(false);
  });
});

describe("nearby, search and lines", () => {
  it("parses nearby stop areas sorted by distance", () => {
    const stops = parseNearby({
      places_nearby: [
        { embedded_type: "stop_area", distance: "420", stop_area: { id: "stop_area:IDFM:71264", name: "Châtelet (Paris)", coord: { lon: "2.347", lat: "48.858" } } },
        { embedded_type: "stop_area", distance: "120", stop_area: { id: "stop_area:IDFM:73626", name: "Hôtel de Ville (Paris)", coord: { lon: "2.352", lat: "48.857" } } },
        { embedded_type: "stop_point", distance: "10", stop_point: { id: "sp", name: "x" } },
      ],
    });
    expect(stops.map((s) => s.name)).toEqual(["Hôtel de Ville", "Châtelet"]);
    expect(stops[0]?.distanceM).toBe(120);
  });

  it("parses lines and stop areas from a search", () => {
    const results = parseSearch({
      pt_objects: [
        { embedded_type: "line", line: { id: "line:IDFM:C01743", name: "B", code: "B", color: "5291CE", commercial_mode: { name: "RER" }, network: { name: "RER" } } },
        { embedded_type: "stop_area", stop_area: { id: "stop_area:IDFM:71264", name: "Châtelet (Paris)", coord: { lon: "2.347", lat: "48.858" } } },
      ],
    });
    expect(results[0]).toMatchObject({ kind: "line", id: "line:IDFM:C01743" });
    expect(results[0]?.kind === "line" && results[0].badge.color).toBe("#5291CE");
    expect(results[1]).toMatchObject({ kind: "stop", name: "Châtelet" });
  });

  it("orders a line's stops along its shape", () => {
    const detail = parseLine(
      {
        lines: [
          {
            id: "line:IDFM:C01371",
            name: "1",
            code: "1",
            color: "FFCD00",
            text_color: "000000",
            commercial_mode: { name: "Métro" },
            opening_time: "053000",
            closing_time: "011500",
            geojson: { type: "MultiLineString", coordinates: [[[2.29, 48.875], [2.33, 48.865], [2.37, 48.85], [2.44, 48.845]], [[2.3, 48.87], [2.31, 48.869]]] },
          },
        ],
      },
      {
        stop_areas: [
          { id: "c", name: "Bastille (Paris)", coord: { lon: "2.369", lat: "48.853" } },
          { id: "a", name: "Charles de Gaulle Étoile (Paris)", coord: { lon: "2.295", lat: "48.874" } },
          { id: "d", name: "Château de Vincennes (Vincennes)", coord: { lon: "2.44", lat: "48.844" } },
          { id: "b", name: "Concorde (Paris)", coord: { lon: "2.321", lat: "48.866" } },
        ],
      },
    );
    expect(detail?.badge.kind).toBe("metro");
    expect(detail?.badge.textColor).toBe("#000000");
    expect(detail?.shape).toHaveLength(2);
    expect(detail?.stops.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(detail?.openingTime).toBe("05:30");
    expect(detail?.closingTime).toBe("01:15");
  });
});

describe("helpers", () => {
  it("classifies commercial modes", () => {
    expect(modeKind("RER")).toBe("rer");
    expect(modeKind("Métro")).toBe("metro");
    expect(modeKind("Tramway")).toBe("tram");
    expect(modeKind("Transilien")).toBe("train");
    expect(modeKind("Noctilien")).toBe("bus");
    expect(modeKind("")).toBe("other");
  });

  it("cleans names and formats waits", () => {
    expect(cleanName("Gare de Lyon (Paris)")).toBe("Gare de Lyon");
    expect(cleanName("Nation")).toBe("Nation");
    expect(formatWait(new Date(2026, 10, 20, 8, 30, 20), NOW)).toBe("à l'approche");
    expect(formatWait(new Date(2026, 10, 20, 8, 37, 0), NOW).replace(/ /g, " ")).toBe("7 min");
    expect(formatWait(new Date(2026, 10, 20, 9, 45, 0), NOW)).toBe("09:45");
  });
});
