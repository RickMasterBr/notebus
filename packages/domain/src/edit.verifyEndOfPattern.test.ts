import { describe, expect, it } from "vitest";
import { verifyOptions } from "./edit.ts";
import { matchObservation, type LinePatternData, type MatchNetwork } from "./matching.ts";
import type { TripData } from "./passages.ts";
import { at, hm } from "./testing/e03Network.ts";

// B-01 na conferência (TL-09): verifyOptions repassa o fato a matchObservation, então kind/mode valem.
// Rede INVENTADA (D-091), a mesma de matching.endOfPattern.test.ts: circular de 4 posições, Estádio nas posições 1 e 4.

const WED = "2026-10-07";
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

const tripOf = (id: string, start: number, end: number): TripData => ({
  id,
  patternId: PATTERN.id,
  firstPosition: 1,
  lastPosition: 4,
  stopTimes: [
    { position: 1, serviceMinute: start, origin: "official" },
    { position: 4, serviceMinute: end, origin: "official" },
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

const draft = { stopId: ESTADIO, lineId: PATTERN.lineId, observedAt: at(WED, 8, 37), observedEndAt: null };

describe("B-01 na conferência do registro", () => {
  it("embarque ao vivo às 08:37 no ponto inicial=final: escolhe a passagem que parte", () => {
    expect(verifyOptions({ ...draft, kind: "boarded", mode: "live" }, NET).status).toBe("auto");
    // No auto, verifyOptions não lista passagem; a escolhida vem do mesmo matchObservation que ele usa.
    expect(matchObservation({ ...draft, kind: "boarded", mode: "live" }, NET).candidates[0]).toMatchObject({ tripId: "c-trip/0840", position: 1 });
  });

  it("sem kind e mode (chamadores antigos) o resultado é o de antes: ambíguo", () => {
    expect(verifyOptions(draft, NET).status).toBe("ambiguous");
  });

  it("ajustado depois (mode later) não aplica a regra: ambíguo", () => {
    expect(verifyOptions({ ...draft, kind: "boarded", mode: "later" }, NET).status).toBe("ambiguous");
  });
});
