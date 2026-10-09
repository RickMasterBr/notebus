/// <reference types="node" />
// B-01 na conferência (TL-09), a cadeia inteira: factOf (rideView) leva kind/mode do registro até verifyOptions.
// Se alguém tirar kind ou mode de factOf, ou parar de repassá-los, o embarque ao vivo volta a ficar ambíguo.
// Rede INVENTADA (D-091): circular de 4 posições, Estádio nas posições 1 e 4; quarta 07/10/2026, hora de verão (UTC+1).
import { describe, expect, it } from "vitest";
import { matchObservation, verifyOptions, type LinePatternData, type MatchNetwork } from "@notebus/domain";
import { factOf } from "./rideView";

const ESTADIO = "c-estadio";
const PATTERN: LinePatternData = {
  id: "c-pat",
  lineId: "c-linha",
  stops: [
    { position: 1, stopId: ESTADIO, isTimepoint: true },
    { position: 2, stopId: "c-a", isTimepoint: false },
    { position: 3, stopId: "c-b", isTimepoint: false },
    { position: 4, stopId: ESTADIO, isTimepoint: true },
  ],
};
const hm = (h: number, m: number) => h * 60 + m;
const tripOf = (id: string, start: number, end: number) => ({
  id,
  patternId: PATTERN.id,
  firstPosition: 1,
  lastPosition: 4,
  stopTimes: [
    { position: 1, serviceMinute: start, origin: "official" as const },
    { position: 4, serviceMinute: end, origin: "official" as const },
  ],
});
const trips = [tripOf("c-trip/0750", hm(7, 50), hm(8, 36)), tripOf("c-trip/0840", hm(8, 40), hm(9, 26))];
const NET: MatchNetwork = {
  calendar: { overrides: [], holidays: [] },
  schedule: {
    trips: trips.map((t) => ({ id: t.id, timetableId: "c-tt", dayTypes: ["weekday"], seasonId: null })),
    timetables: [{ id: "c-tt", validFrom: "2026-09-01", validTo: null }],
    seasons: [],
  },
  patterns: [PATTERN],
  trips,
};

const row = (mode: "live" | "later") => ({
  stopId: ESTADIO,
  lineId: PATTERN.lineId,
  observedAt: Date.UTC(2026, 9, 7, 7, 37),
  observedEndAt: null,
  kind: "boarded" as const,
  mode,
});

describe("B-01 na conferência, pela cadeia factOf → verifyOptions", () => {
  it("embarque ao vivo às 08:37 no ponto inicial=final: auto, com a passagem que parte", () => {
    const fact = factOf(row("live"));
    expect(verifyOptions(fact, NET).status).toBe("auto");
    expect(matchObservation(fact, NET).candidates[0]).toMatchObject({ tripId: "c-trip/0840", position: 1 });
  });

  it("o mesmo registro ajustado depois (later) continua ambíguo", () => {
    expect(verifyOptions(factOf(row("later")), NET).status).toBe("ambiguous");
  });
});
