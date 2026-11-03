import { describe, expect, it } from "vitest";
import type { PatternData, TripData } from "@notebus/domain";
import {
  familyOfOfficialKey,
  passagePositionIn,
  patternInForceOn,
  tripsSeenByOptionPatterns,
} from "./continuity";
import { passageRecords, passageTarget } from "./records";
import type { ScheduleSnapshot } from "./schedule";

const stops = (ids: string[], from = 1) => ids.map((stopId, i) => ({ position: from + i, stopId, isTimepoint: false }));

// P-old: A B C; P-new: X A B C (uma paragem a mais no começo); P-other (família G) e P-user (sem família).
const pOld: PatternData = { id: "P-old", family: "F", stops: stops(["A", "B", "C"]) };
const pNew: PatternData = { id: "P-new", family: "F", stops: stops(["X", "A", "B", "C"]) };
const pOther: PatternData = { id: "P-other", family: "G", stops: stops(["A", "B", "C"]) };
const pUser: PatternData = { id: "P-user", stops: stops(["A", "B", "C"]) };

function snapshot(withQuadros = true): ScheduleSnapshot {
  const patterns = [pOld, pNew, pOther, pUser];
  const patternStopById = new Map<string, { patternId: string; position: number; stopId: string }>();
  for (const p of patterns) for (const s of p.stops) patternStopById.set(`${p.id}:${s.position}`, { patternId: p.id, position: s.position, stopId: s.stopId });
  return {
    patterns,
    patternStopById,
    ...(withQuadros
      ? {
          patternQuadros: new Map([
            ["P-old", [{ validFrom: "2026-09-01", validTo: "2026-11-09" }]],
            ["P-new", [{ validFrom: "2026-11-10", validTo: null }]],
          ]),
        }
      : {}),
  } as unknown as ScheduleSnapshot;
}

describe("familyOfOfficialKey", () => {
  it("tira a vigência da chave do percurso", () => {
    expect(familyOfOfficialKey("mobilis/2026-09-01/pattern/L1")).toBe("mobilis/pattern/L1");
    expect(familyOfOfficialKey("mobilis/2026-11-10/pattern/L6-s2")).toBe("mobilis/pattern/L6-s2");
  });
  it("chave nula ou de outra forma não tem família", () => {
    expect(familyOfOfficialKey(null)).toBeUndefined();
    expect(familyOfOfficialKey("mobilis/stop/9001")).toBeUndefined();
  });
});

describe("patternInForceOn", () => {
  const data = snapshot();
  it("as duas pontas da vigência valem", () => {
    expect(patternInForceOn(data, "P-old", "2026-11-08")?.id).toBe("P-old");
    expect(patternInForceOn(data, "P-old", "2026-11-09")?.id).toBe("P-old");
    expect(patternInForceOn(data, "P-old", "2026-11-10")?.id).toBe("P-new");
    expect(patternInForceOn(data, "P-old", "2026-11-11")?.id).toBe("P-new");
  });
  it("vale nos dois sentidos", () => {
    expect(patternInForceOn(data, "P-new", "2026-11-09")?.id).toBe("P-old");
    expect(patternInForceOn(data, "P-new", "2026-11-10")?.id).toBe("P-new");
  });
  it("sem família, sem ninguém em vigor ou sem quadros, é o próprio", () => {
    expect(patternInForceOn(data, "P-user", "2026-11-10")?.id).toBe("P-user");
    expect(patternInForceOn(data, "P-old", "2026-08-01")?.id).toBe("P-old");
    expect(patternInForceOn(snapshot(false), "P-old", "2026-11-10")?.id).toBe("P-old");
  });
});

describe("passagePositionIn", () => {
  const data = snapshot();
  it("mesmo percurso: a posição guardada; mesma família: a mesma passagem; senão null", () => {
    expect(passagePositionIn(data, "P-old:2", pOld)).toBe(2);
    expect(passagePositionIn(data, "P-old:2", pNew)).toBe(3);
    expect(passagePositionIn(data, "P-old:2", pOther)).toBeNull();
    expect(passagePositionIn(data, "P-user:2", pNew)).toBeNull();
    expect(passagePositionIn(data, "nao-existe", pNew)).toBeNull();
  });
});

describe("tripsSeenByOptionPatterns", () => {
  const data = snapshot();
  const time = (position: number) => ({ position, serviceMinute: 480 + position, origin: "official" as const });
  const tripNew: TripData = { id: "t-new", patternId: "P-new", firstPosition: 2, lastPosition: 4, stopTimes: [2, 3, 4].map(time) };
  const tripFromX: TripData = { id: "t-x", patternId: "P-new", firstPosition: 1, lastPosition: 4, stopTimes: [1, 2, 3, 4].map(time) };
  const tripOld: TripData = { id: "t-old", patternId: "P-old", firstPosition: 1, lastPosition: 3, stopTimes: [1, 2, 3].map(time) };
  const tripOther: TripData = { id: "t-other", patternId: "P-other", firstPosition: 1, lastPosition: 3, stopTimes: [1, 2, 3].map(time) };
  const tripUser: TripData = { id: "t-user", patternId: "P-user", firstPosition: 1, lastPosition: 3, stopTimes: [1, 2, 3].map(time) };

  it("a viagem do percurso novo ganha o patternId e as posições do percurso da opção", () => {
    const [seen] = tripsSeenByOptionPatterns(data, [tripNew], [pOld]);
    expect(seen).toMatchObject({ id: "t-new", patternId: "P-old", firstPosition: 1, lastPosition: 3 });
    expect(seen!.stopTimes.map((s) => s.position)).toEqual([1, 2, 3]);
  });
  it("viagem que começa na paragem que o antigo não tem sai; a posição sem correspondente sai dos horários", () => {
    expect(tripsSeenByOptionPatterns(data, [tripFromX], [pOld])).toEqual([]);
    const both = tripsSeenByOptionPatterns(data, [{ ...tripNew, stopTimes: [1, 2, 3, 4].map(time) }], [pOld]);
    expect(both[0]!.stopTimes.map((s) => s.position)).toEqual([1, 2, 3]);
  });
  it("viagem do próprio percurso, de outra família ou sem família passa igual", () => {
    const trips = [tripOld, tripOther, tripUser];
    expect(tripsSeenByOptionPatterns(data, trips, [pOld])).toEqual(trips);
  });
});

describe("família no registro e no alvo", () => {
  const data = {
    ...snapshot(),
    calendar: { overrides: [], holidays: [], includeMunicipal: false },
    schedule: { trips: [{ id: "t1", timetableId: "tt1" }, { id: "t2", timetableId: "tt1" }], timetables: [{ id: "tt1", validFrom: "2026-09-01", validTo: null }], seasons: [] },
    trips: [
      { id: "t1", patternId: "P-new", firstPosition: 1, lastPosition: 4, stopTimes: [] },
      { id: "t2", patternId: "P-user", firstPosition: 1, lastPosition: 3, stopTimes: [] },
    ],
  } as unknown as ScheduleSnapshot;

  it("passageTarget leva a família quando o percurso tem e não leva a chave quando não tem", () => {
    expect(passageTarget(data, "t1", 2, "2026-11-10")?.family).toBe("F");
    expect(passageTarget(data, "t2", 2, "2026-11-10")).not.toHaveProperty("family");
  });
  it("passageRecords leva patternFamily do percurso do registro", () => {
    const row = (patternStopId: string) =>
      ({ matchStatus: "auto", deletedAt: null, tripId: "t1", patternStopId, deviationMin: 0, serviceDate: "2026-10-07", observedAt: 1, mode: "live", kind: "boarded" }) as never;
    const [old, user] = passageRecords([row("P-old:2"), row("P-user:2")], data);
    expect(old!.patternFamily).toBe("F");
    expect(user).not.toHaveProperty("patternFamily");
  });
});
