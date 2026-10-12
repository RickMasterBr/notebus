import { describe, expect, it } from "vitest";
import type { NetworkPatternItem } from "../db/networkList";
import { lineProfile, lineProfileText } from "./lineProfile";
import { baseTimes } from "./networkView";
import type { ScheduleSnapshot } from "./schedule";

// Dados inventados.
const TODAY = "2026-10-08";
const stop = (position: number, stopId: string, isTimepoint = false) => ({
  position,
  stopId,
  name: `Ponto ${stopId}`,
  isTimepoint,
  timepointLabel: null,
});
const pattern = (id: string, stops: ReturnType<typeof stop>[], isCircular = false): NetworkPatternItem => ({
  id,
  label: `Percurso ${id}`,
  isCircular,
  stops,
});

// pA: s1 (controle) · s2 · s3. pB: s3 (controle) · s4. pA e pB dividem s3.
const pA = pattern("pA", [stop(1, "s1", true), stop(2, "s2"), stop(3, "s3")]);
const pB = pattern("pB", [stop(1, "s3", true), stop(2, "s4")]);
// Circular: o mesmo ponto no início e no fim.
const pC = pattern("pC", [stop(1, "s1", true), stop(2, "s2"), stop(3, "s1")], true);

const trip = (id: string, patternId: string, first: number, last: number, minute: number) => ({
  id,
  patternId,
  firstPosition: first,
  lastPosition: last,
  stopTimes: [
    { position: first, serviceMinute: minute, origin: "official" as const },
    { position: last, serviceMinute: minute + 20, origin: "official" as const },
  ],
});
const sched = (id: string, dayTypes: ("weekday" | "saturday" | "sunday_holiday")[]) => ({
  id,
  timetableId: "tt1",
  dayTypes,
  seasonId: null,
});

const snapshot = (): ScheduleSnapshot => ({
  calendar: { overrides: [], holidays: [], includeMunicipal: true },
  schedule: {
    trips: [
      sched("a1", ["weekday"]),
      sched("a2", ["weekday"]),
      sched("a3", ["weekday"]), // parcial: começa na posição 2
      sched("a4", ["sunday_holiday"]),
      sched("b1", ["weekday"]),
      sched("c1", ["weekday"]),
    ],
    timetables: [{ id: "tt1", validFrom: "2026-09-01", validTo: null }],
    seasons: [],
  },
  patterns: [pA, pB, pC].map((p) => ({
    id: p.id,
    stops: p.stops.map((s) => ({ position: s.position, stopId: s.stopId, isTimepoint: s.isTimepoint })),
  })),
  trips: [
    trip("a1", "pA", 1, 3, 480),
    trip("a2", "pA", 1, 3, 540),
    trip("a3", "pA", 2, 3, 600),
    trip("a4", "pA", 1, 3, 500),
    trip("b1", "pB", 1, 2, 490),
    trip("c1", "pC", 1, 3, 510),
  ],
  patternLine: new Map(),
  patternLineId: new Map(),
  lineInfo: new Map(),
  patternStopIds: new Map(),
  patternStopById: new Map(),
  stopNames: new Map([
    ["s1", "Ponto s1"],
    ["s2", "Ponto s2"],
    ["s3", "Ponto s3"],
    ["s4", "Ponto s4"],
  ]),
});

const profile = (patterns: NetworkPatternItem[], dayType: "weekday" | "saturday" | "sunday_holiday", snap = snapshot()) =>
  lineProfile({ patterns, snapshot: snap, dayType, todayLisbon: TODAY });

describe("lineProfile", () => {
  it("dois percursos que dividem 1 ponto: o ponto conta uma vez", () => {
    expect(profile([pA, pB], "weekday")).toEqual({ patternCount: 2, stopCount: 4, tripCount: 4 });
  });

  it("percurso circular com o mesmo ponto no início e no fim: conta uma vez", () => {
    expect(profile([pC], "weekday")).toEqual({ patternCount: 1, stopCount: 2, tripCount: 1 });
  });

  it("o tipo de dia muda as viagens", () => {
    expect(profile([pA, pB], "weekday").tripCount).toBe(4);
    expect(profile([pA, pB], "sunday_holiday").tripCount).toBe(1);
    expect(profile([pA, pB], "saturday").tripCount).toBe(0);
  });

  it("tripCount = times.length + partialCount de baseTimes, somado por percurso", () => {
    const snap = snapshot();
    const sum = [pA, pB].reduce((acc, p) => {
      const r = baseTimes({ snapshot: snap, patternId: p.id, dayType: "weekday", todayLisbon: TODAY });
      return acc + r.times.length + r.partialCount;
    }, 0);
    expect(profile([pA, pB], "weekday", snap).tripCount).toBe(sum);
  });

  it("snapshot nulo: tripCount nulo", () => {
    const p = lineProfile({ patterns: [pA], snapshot: null, dayType: "weekday", todayLisbon: TODAY });
    expect(p).toEqual({ patternCount: 1, stopCount: 3, tripCount: null });
  });

  it("zero percursos", () => {
    expect(profile([], "weekday")).toEqual({ patternCount: 0, stopCount: 0, tripCount: 0 });
  });
});

describe("lineProfileText", () => {
  it("plural", () => {
    expect(lineProfileText({ patternCount: 2, stopCount: 4, tripCount: 4 })).toBe(
      "2 percursos · 4 paragens · 4 viagens neste tipo de dia",
    );
  });

  it("singular", () => {
    expect(lineProfileText({ patternCount: 1, stopCount: 1, tripCount: 1 })).toBe(
      "1 percurso · 1 paragem · 1 viagem neste tipo de dia",
    );
  });

  it("zero usa o plural", () => {
    expect(lineProfileText({ patternCount: 0, stopCount: 0, tripCount: 0 })).toBe(
      "0 percursos · 0 paragens · 0 viagens neste tipo de dia",
    );
  });

  it("sem horários carregados, omite as viagens", () => {
    expect(lineProfileText({ patternCount: 2, stopCount: 3, tripCount: null })).toBe("2 percursos · 3 paragens");
  });
});
