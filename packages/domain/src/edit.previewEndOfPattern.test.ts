import { describe, expect, it } from "vitest";
import { previewMatch } from "./edit.ts";
import { deduceObservation, type LinePatternData, type MatchNetwork, type ObservationFact } from "./matching.ts";
import type { TripData } from "./passages.ts";
import { at, hm } from "./testing/e03Network.ts";

// B-01 na prévia do Registrar: a frase ao vivo (previewMatch) tem de dar o mesmo resultado que a dedução gravada
// (deduceObservation) quando o embarque é ao vivo no ponto inicial=final de um percurso circular.
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
const fact = (kind: ObservationFact["kind"], mode: ObservationFact["mode"]): ObservationFact => ({ ...draft, kind, mode });

describe("B-01 na prévia do Registrar", () => {
  it("embarque ao vivo às 08:37 no ponto inicial=final: a prévia casa com a viagem que parte, igual à dedução gravada", () => {
    const saved = deduceObservation(fact("boarded", "live"), NET);
    expect([saved.matchStatus, saved.tripId, saved.position]).toEqual(["auto", "c-trip/0840", 1]);

    const preview = previewMatch({ ...draft, kind: "boarded", mode: "live" }, NET);
    expect(preview.status).toBe("auto");
    expect(preview.chosen).toMatchObject({ tripId: saved.tripId, position: saved.position });
    expect(preview.departureMinute).toBe(hm(8, 40));
  });

  it("sem kind e mode o comportamento é o de antes (as duas passagens empatam em candidatas)", () => {
    const preview = previewMatch(draft, NET);
    expect(preview.status).toBe("ambiguous");
    expect(preview.candidates.map((c) => c.position).sort()).toEqual([1, 4]);
  });
});
