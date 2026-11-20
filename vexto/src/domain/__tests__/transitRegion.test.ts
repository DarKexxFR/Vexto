import { modeKind } from "@/domain/transit";
import { regionAt, tagId, untagId } from "@/domain/transitRegion";

describe("transit regions", () => {
  it("picks the network from coordinates", () => {
    expect(regionAt([2.3522, 48.8566])).toBe("idfm"); // Paris
    expect(regionAt([2.0, 48.8])).toBe("idfm"); // Versailles area
    expect(regionAt([5.0415, 47.3220])).toBe("dijon"); // Dijon centre
    expect(regionAt([4.8357, 45.764])).toBe("sncf"); // Lyon
    expect(regionAt([5.37, 43.29])).toBe("sncf"); // Marseille
  });

  it("tags non-IDFM ids and keeps IDFM ids unchanged", () => {
    expect(tagId("idfm", "stop_area:IDFM:71264")).toBe("stop_area:IDFM:71264");
    expect(tagId("sncf", "stop_area:SNCF:87713040")).toBe("sncf|stop_area:SNCF:87713040");
    expect(tagId("dijon", "sncf|x")).toBe("sncf|x");
  });

  it("round-trips ids and defaults legacy ids to IDFM", () => {
    expect(untagId("dijon|line:DIVIA:T1")).toEqual({ region: "dijon", id: "line:DIVIA:T1" });
    expect(untagId("stop_area:IDFM:71264")).toEqual({ region: "idfm", id: "stop_area:IDFM:71264" });
    expect(untagId("bogus|x")).toEqual({ region: "idfm", id: "bogus|x" });
  });

  it("recognises SNCF commercial modes as trains", () => {
    for (const label of ["TER", "TGV INOUI", "OUIGO", "Intercités", "Lyria"]) expect(modeKind(label)).toBe("train");
    expect(modeKind("Tramway")).toBe("tram");
    expect(modeKind("Bus")).toBe("bus");
  });
});
