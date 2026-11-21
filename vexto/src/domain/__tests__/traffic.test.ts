import { parseDepartures, parseJourneys } from "@/domain/transit";
import { alertLevel, parseDisruptions, stripHtml, type NvDisruption } from "@/domain/traffic";

const NOW = new Date(2026, 10, 20, 8, 30);

const RER_B_CUT: NvDisruption = {
  id: "d1",
  status: "active",
  severity: { name: "bloquante", effect: "NO_SERVICE" },
  messages: [
    { text: "RER B : trafic interrompu entre Gare du Nord et Aéroport CDG", channel: { name: "titre", types: ["title"] } },
    { text: "<p>En raison d'un <b>incident technique</b>,&nbsp;le trafic est interrompu.</p><p>Reprise estimée 10h.</p>", channel: { name: "web", types: ["web", "mobile"] } },
  ],
  impacted_objects: [{ pt_object: { id: "line:IDFM:C01743", embedded_type: "line" } }],
  application_periods: [{ begin: "20261120T060000", end: "20261120T100000" }],
};
const PAST: NvDisruption = {
  id: "d0",
  status: "past",
  messages: [{ text: "Ancien message", channel: { types: ["web"] } }],
};
const WORKS: NvDisruption = {
  id: "d2",
  severity: { name: "information", effect: "OTHER_EFFECT" },
  messages: [{ text: "Travaux ce week-end sur le métro 1", channel: { types: ["web"] } }],
  impacted_objects: [{ pt_object: { id: "line:IDFM:C01371", embedded_type: "line" } }],
  application_periods: [{ begin: "20261101T000000", end: "20261231T235900" }],
};
const LATER: NvDisruption = {
  id: "d3",
  status: "future",
  messages: [{ text: "Grève le 3 décembre", channel: { types: ["web"] } }],
  application_periods: [{ begin: "20261203T000000", end: "20261203T235900" }],
};

describe("traffic alerts", () => {
  it("strips HTML", () => {
    expect(stripHtml("<p>Trafic <b>interrompu</b>&nbsp;!</p><p>Suite</p>")).toBe("Trafic interrompu !\nSuite");
  });

  it("maps Navitia effects to levels", () => {
    expect(alertLevel("NO_SERVICE")).toBe("blocking");
    expect(alertLevel("SIGNIFICANT_DELAYS")).toBe("delays");
    expect(alertLevel("OTHER_EFFECT", "information")).toBe("info");
    expect(alertLevel(undefined, "perturbée")).toBe("delays");
  });

  it("keeps current alerts, most severe first", () => {
    const alerts = parseDisruptions([WORKS, PAST, RER_B_CUT, LATER, RER_B_CUT], NOW);
    expect(alerts.map((a) => a.id)).toEqual(["d1", "d2"]);
    expect(alerts[0]).toMatchObject({
      level: "blocking",
      title: "RER B : trafic interrompu entre Gare du Nord et Aéroport CDG",
      lineIds: ["line:IDFM:C01743"],
    });
    expect(alerts[0]?.message).toContain("incident technique, le trafic est interrompu.");
    expect(alerts[0]?.end?.getHours()).toBe(10);
    expect(alerts[1]?.title).toBe("Travaux ce week-end sur le métro 1");
  });

  it("attaches alerts to departure groups by line", () => {
    const groups = parseDepartures(
      {
        disruptions: [RER_B_CUT],
        departures: [
          {
            display_informations: { commercial_mode: "RER", code: "B", direction: "Mitry", links: [{ type: "line", id: "line:IDFM:C01743" }] },
            stop_date_time: { departure_date_time: "20261120T084000" },
          },
          {
            display_informations: { commercial_mode: "RER", code: "A", direction: "Boissy", links: [{ type: "line", id: "line:IDFM:C01742" }] },
            stop_date_time: { departure_date_time: "20261120T084200" },
          },
        ],
      },
      NOW,
    );
    expect(groups.find((g) => g.line.code === "B")?.alerts.map((a) => a.id)).toEqual(["d1"]);
    expect(groups.find((g) => g.line.code === "A")?.alerts).toEqual([]);
  });

  it("attaches alerts to journey legs via disruption links", () => {
    const [j] = parseJourneys(
      {
        disruptions: [WORKS],
        journeys: [
          {
            departure_date_time: "20261120T083500",
            arrival_date_time: "20261120T090000",
            sections: [
              {
                type: "public_transport",
                departure_date_time: "20261120T083500",
                arrival_date_time: "20261120T090000",
                display_informations: { commercial_mode: "Métro", code: "1", links: [{ type: "disruption", id: "d2" }] },
              },
            ],
          },
        ],
      },
      NOW,
    );
    expect(j?.legs[0]?.alerts.map((a) => a.id)).toEqual(["d2"]);
  });
});
