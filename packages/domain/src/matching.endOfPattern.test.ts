import { describe, expect, it } from "vitest";
import { deduceObservation, matchObservation, type LinePatternData, type MatchNetwork, type ObservationFact } from "./matching.ts";
import type { TripData } from "./passages.ts";
import { at, hm } from "./testing/e03Network.ts";

// B-01 (achados do uso real 09/10): num percurso circular o ponto inicial é também o final. Embarque ao vivo ali não pode
// casar com a passagem de fim de percurso ("Termina aqui") quando existe uma que parte dali na janela −5/+15.
// Rede INVENTADA (D-091): circular de 4 posições, Estádio nas posições 1 e 4.

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

// A: parte 07:50 e chega ao Estádio 08:36 (fim de percurso). B: parte do Estádio 08:40 (posição 1) e chega 09:26.
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
const NETWORK_FOR = (trips: TripData[]): MatchNetwork => ({
  calendar: { overrides: [], holidays: [] },
  schedule: {
    trips: trips.map((t) => ({ id: t.id, timetableId: "c-tt", dayTypes: ["weekday"], seasonId: null })),
    timetables: [{ id: "c-tt", validFrom: "2026-09-01", validTo: null }],
    seasons: [],
  },
  patterns: [PATTERN],
  trips,
});

const ARRIVES = "c-trip/0750"; // chega às 08:36
const DEPARTS = "c-trip/0840"; // parte às 08:40
const NET = NETWORK_FOR([tripOf(ARRIVES, hm(7, 50), hm(8, 36)), tripOf(DEPARTS, hm(8, 40), hm(9, 26))]);

const fact = (kind: ObservationFact["kind"], mode: ObservationFact["mode"] = "live", h = 8, m = 37): ObservationFact => ({
  stopId: ESTADIO,
  lineId: PATTERN.lineId,
  observedAt: at(WED, h, m),
  observedEndAt: null,
  kind,
  mode,
});

describe("B-01: embarque no ponto inicial=final de um percurso circular", () => {
  it("embarque ao vivo às 08:37 casa com a viagem que PARTE (08:40, posição 1), não com a que termina (08:36, posição 4)", () => {
    const d = deduceObservation(fact("boarded"), NET);
    expect(d.matchStatus).toBe("auto");
    expect([d.tripId, d.position]).toEqual([DEPARTS, 1]);
    expect(d.nearest).toMatchObject({ tripId: DEPARTS, position: 1 });
  });

  it("empate exato (as duas às 08:36): continua preferindo a que parte", () => {
    const tie = NETWORK_FOR([tripOf(ARRIVES, hm(7, 50), hm(8, 36)), tripOf(DEPARTS, hm(8, 36), hm(9, 22))]);
    const m = matchObservation(fact("boarded"), tie);
    expect(m.status).toBe("auto");
    expect([m.candidates[0]!.tripId, m.candidates[0]!.position]).toEqual([DEPARTS, 1]);
    expect(m.nearest).toMatchObject({ tripId: DEPARTS, position: 1 });
  });

  it("sem passagem que parta dentro da janela, o comportamento de hoje continua (casa com a final)", () => {
    const sozinha = NETWORK_FOR([tripOf(ARRIVES, hm(7, 50), hm(8, 36))]);
    const m = matchObservation(fact("boarded"), sozinha);
    expect(m.status).toBe("auto");
    expect([m.candidates[0]!.tripId, m.candidates[0]!.position]).toEqual([ARRIVES, 4]);
  });

  it("embarque que não é ao vivo (depois/memória) não muda: as duas continuam candidatas", () => {
    for (const mode of ["later", "memory"] as const) {
      const m = matchObservation(fact("boarded", mode), NET);
      expect(m.status).toBe("ambiguous");
      expect(m.candidates.map((c) => c.position).sort()).toEqual([1, 4]);
    }
  });

  it("descer (alighted) no mesmo ponto e hora continua casando com a passagem final", () => {
    const m = matchObservation(fact("alighted"), NET);
    expect(m.candidates.map((c) => [c.tripId, c.position])).toContainEqual([ARRIVES, 4]);
    expect(m.nearest).toMatchObject({ tripId: ARRIVES, position: 4 });
  });

  it("passou (passed) não muda: a passagem final segue sendo a mais perto", () => {
    const m = matchObservation(fact("passed"), NET);
    expect(m.nearest).toMatchObject({ tripId: ARRIVES, position: 4 });
    expect(m.candidates).toHaveLength(2);
  });
});
