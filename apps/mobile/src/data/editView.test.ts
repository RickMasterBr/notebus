import { describe, expect, it } from "vitest";
import { ongoingOf } from "./editView";

describe("ongoingOf", () => {
  const boardingRow = {
    id: "obs-board-1",
    rideId: "ride-1",
    lineId: "line-1",
    tripId: "trip-10",
    serviceDate: "2026-10-01",
    matchStatus: "auto" as const,
  };

  const alightRow = {
    id: "obs-alight-1",
    rideId: "ride-1",
    lineId: "line-1",
    tripId: null,
    serviceDate: null,
    matchStatus: null,
  };

  const ride = {
    id: "ride-1",
    boardingObservationId: "obs-board-1",
  };

  it("o embarque que abriu o ride não se apoia nele (devolve null)", () => {
    const result = ongoingOf(boardingRow, [ride], [boardingRow]);
    expect(result).toBeNull();
  });

  it("registro sem rideId devolve null", () => {
    const result = ongoingOf({ id: "obs-alone", rideId: null }, [ride], [boardingRow]);
    expect(result).toBeNull();
  });

  it("descida do mesmo ride com embarque casado (auto) devolve a viagem em curso", () => {
    const result = ongoingOf(alightRow, [ride], [boardingRow, alightRow]);
    expect(result).toEqual({
      lineId: "line-1",
      tripId: "trip-10",
      serviceDate: "2026-10-01",
    });
  });

  it("descida do mesmo ride com embarque manual devolve a viagem em curso", () => {
    const manualBoarding = { ...boardingRow, matchStatus: "manual" as const };
    const result = ongoingOf(alightRow, [ride], [manualBoarding, alightRow]);
    expect(result).toEqual({
      lineId: "line-1",
      tripId: "trip-10",
      serviceDate: "2026-10-01",
    });
  });

  it("descida com embarque não resolvido (orphan) devolve null", () => {
    const orphanBoarding = { ...boardingRow, matchStatus: "orphan" as const };
    const result = ongoingOf(alightRow, [ride], [orphanBoarding, alightRow]);
    expect(result).toBeNull();
  });

  it("descida com embarque sem tripId devolve null", () => {
    const incompleteBoarding = { ...boardingRow, tripId: null };
    const result = ongoingOf(alightRow, [ride], [incompleteBoarding, alightRow]);
    expect(result).toBeNull();
  });

  it("descida com ride pai inexistente devolve null", () => {
    const result = ongoingOf(alightRow, [], [boardingRow, alightRow]);
    expect(result).toBeNull();
  });
});
