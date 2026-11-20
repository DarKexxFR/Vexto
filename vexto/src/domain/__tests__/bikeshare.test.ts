import { availabilityLevel, inVelibArea, nearestStations, parseGbfsStations, parseOdsStations } from "@/domain/bikeshare";

const ODS = {
  results: [
    { stationcode: "4010", name: "Hôtel de Ville", is_installed: "OUI", is_renting: "OUI", is_returning: "OUI", capacity: 40, numdocksavailable: 12, numbikesavailable: 26, mechanical: 20, ebike: 6, coordonnees_geo: { lon: 2.3518, lat: 48.8569 } },
    { stationcode: "4021", name: "Saint-Paul", is_installed: "OUI", is_renting: "OUI", is_returning: "OUI", capacity: 30, numdocksavailable: 30, numbikesavailable: 0, mechanical: 0, ebike: 0, coordonnees_geo: { lon: 2.3608, lat: 48.8553 } },
    { stationcode: "4003", name: "Rivoli", is_installed: "NON", is_renting: "NON", is_returning: "NON", capacity: 20, numdocksavailable: 0, numbikesavailable: 5, mechanical: 5, ebike: 0, coordonnees_geo: { lon: 2.3530, lat: 48.8572 } },
    { stationcode: "9999", name: "Sans coordonnées" },
  ],
};

describe("Vélib' stations", () => {
  const stations = parseOdsStations(ODS);

  it("parses Paris Open Data records", () => {
    expect(stations).toHaveLength(3);
    expect(stations[0]).toMatchObject({ id: "4010", bikes: 26, mechanical: 20, ebikes: 6, docks: 12, renting: true, returning: true });
    expect(stations[2]?.renting).toBe(false);
  });

  it("parses GBFS feeds", () => {
    const gbfs = parseGbfsStations(
      { data: { stations: [{ station_id: 123, stationCode: "4010", name: "Hôtel de Ville", lat: 48.8569, lon: 2.3518, capacity: 40 }] } },
      { data: { stations: [{ station_id: 123, num_bikes_available: 7, num_bikes_available_types: [{ mechanical: 4 }, { ebike: 3 }], num_docks_available: 33, is_installed: 1, is_renting: 1, is_returning: 1 }] } },
    );
    expect(gbfs).toEqual([
      expect.objectContaining({ id: "4010", bikes: 7, mechanical: 4, ebikes: 3, docks: 33, renting: true }),
    ]);
  });

  it("keeps stations with a bike to rent / a dock to return, nearest first", () => {
    const at: [number, number] = [2.3522, 48.8566];
    expect(nearestStations(stations, at, { need: "rent" }).map((s) => s.id)).toEqual(["4010"]);
    expect(nearestStations(stations, at, { need: "return", radiusM: 1000 }).map((s) => s.id)).toEqual(["4010", "4021"]);
    const any = nearestStations(stations, at);
    expect(any[0]?.distanceM).toBeLessThan(60);
  });

  it("classifies availability and the service area", () => {
    expect(availabilityLevel(0)).toBe("none");
    expect(availabilityLevel(2)).toBe("low");
    expect(availabilityLevel(9)).toBe("ok");
    expect(inVelibArea([2.3522, 48.8566])).toBe(true);
    expect(inVelibArea([5.04, 47.32])).toBe(false);
  });
});
