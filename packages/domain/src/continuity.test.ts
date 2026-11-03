import { describe, expect, it } from "vitest";
import { planDepartures, type AlarmOption, type AlarmRule } from "./alarms.ts";
import { dayTypeOf, tripsRunningOn } from "./calendar.ts";
import { busCandidates, type BusOption, type GotoInput } from "./goto.ts";
import { estimateDeviation, type PassageRecord, type PassageTarget } from "./passages.ts";
import { ARRABALDE, NETWORK, P1, VALID_FROM, at, hm, tripId } from "./testing/e03Network.ts";

// Continuidade entre vigências (C4 da E3): percursos, viagens e registros inventados. `P-old` e `P-new` são da família `F`.

const NOW = at("2026-11-03", 12, 0);
const rec = (over: Partial<PassageRecord> = {}): PassageRecord => ({
  deviation: 1,
  observedAt: NOW,
  serviceDate: "2026-10-20",
  dayType: "weekday",
  tripId: "T-old",
  patternId: "P-old",
  patternFamily: "F",
  position: 2,
  stopId: "S1",
  matchStatus: "auto",
  mode: "live",
  kind: "boarded",
  ...over,
});
const target = (over: Partial<PassageTarget> = {}): PassageTarget => ({
  tripId: "T-new",
  patternId: "P-new",
  family: "F",
  position: 2,
  stopId: "S1",
  dayType: "weekday",
  validFrom: null,
  ...over,
});
const many = (n: number, over: Partial<PassageRecord> = {}) => Array.from({ length: n }, () => rec(over));
const est = (records: PassageRecord[], t: PassageTarget) => estimateDeviation("official", records, t, NOW);

describe("C1: levelsOf conta o registro da mesma família", () => {
  it("(i) 3 registros do P-old (família F) e alvo no P-new (família F): nível stop, count 3; sem família, none", () => {
    const e = est(many(3), target());
    expect([e.level, e.count]).toEqual(["stop", 3]);
    expect(est(many(3, { patternFamily: undefined }), target({ family: undefined })).level).toBe("none");
  });

  it("(ii) família diferente não conta", () => {
    expect(est(many(3, { patternFamily: "G" }), target()).level).toBe("none");
  });

  it("(iii) família só de um lado, com patternId diferente, não conta", () => {
    expect(est(many(3), target({ family: undefined })).level).toBe("none");
    expect(est(many(3, { patternFamily: undefined }), target()).level).toBe("none");
  });

  it("(iv) o mesmo patternId sem família conta como hoje", () => {
    const e = est(many(3, { patternId: "P-new", patternFamily: undefined }), target({ family: undefined }));
    expect([e.level, e.count]).toEqual(["stop", 3]);
  });

  it("(v) o nível trip continua pedindo a mesma viagem", () => {
    expect(est(many(3), target()).level).toBe("stop");
    expect(est(many(3, { tripId: "T-new" }), target()).level).toBe("trip");
    expect(est(many(3, { patternId: "P-new", tripId: "T-other" }), target()).level).toBe("stop");
  });

  it("(vi) o tipo de dia continua separando", () => {
    expect(est(many(3, { dayType: "saturday" }), target()).level).toBe("none");
  });
});

describe("C2: D-375, confiança no máximo média sem 6 registros da vigência atual", () => {
  const VF = "2026-11-10";
  const old = (n: number) => many(n, { serviceDate: "2026-10-20" });
  const cur = (n: number) => many(n, { serviceDate: "2026-11-12" });

  it("(i) 6 registros curtos de antes do validFrom: medium (com validFrom nulo seria high)", () => {
    expect(est(old(6), target({ validFrom: null })).confidence).toBe("high");
    expect(est(old(6), target({ validFrom: VF })).confidence).toBe("medium");
  });

  it("(ii) 6 registros de depois do validFrom: high", () => {
    expect(est(cur(6), target({ validFrom: VF })).confidence).toBe("high");
  });

  it("(iii) 5 antigos e 1 novo: medium (conta registros, não pesos)", () => {
    expect(est([...old(5), ...cur(1)], target({ validFrom: VF })).confidence).toBe("medium");
  });

  it("(iv) com 3 registros continua medium e com 1, low", () => {
    expect(est(old(3), target({ validFrom: VF })).confidence).toBe("medium");
    expect(est(old(1), target({ validFrom: VF })).confidence).toBe("low");
  });

  it("(v) weightSum de registros de outra vigência é 0,25 por registro", () => {
    expect(est(old(4), target({ validFrom: VF })).weightSum).toBeCloseTo(1, 10);
  });

  it("(vi) fronteira: 6 registros com serviceDate igual ao validFrom contam como da vigência atual, high", () => {
    expect(est(many(6, { serviceDate: VF }), target({ validFrom: VF })).confidence).toBe("high");
  });
});

describe("C4: o Ir para e o aviso usam os registros da família", () => {
  const FAM = { ...P1, family: "F" };
  // Registros do percurso antigo na Arrabalde (pos. 2), +6 min, de viagem de outra vigência.
  const old = Array.from({ length: 3 }, () =>
    rec({ deviation: 6, observedAt: at("2026-10-05", 8, 20), serviceDate: "2026-10-05", tripId: "T-old", stopId: ARRABALDE }),
  );

  it("(i) busCandidates: com family na opção o horário (beAtStop) muda pelo desvio; sem family, não", () => {
    const option = (pattern: BusOption["pattern"]): BusOption => ({
      id: "casa-facul-l1",
      pattern,
      boardPosition: 2,
      alightPosition: 10,
      walkToBoard: { min: 8, max: null },
      walkAfterAlight: { min: 5, max: null },
      rideMinutes: [],
    });
    const input = (o: BusOption, records: PassageRecord[]): GotoInput => ({
      busOptions: [o],
      walk: null,
      trips: NETWORK.trips.filter((t) => t.id.includes("/weekday/")),
      records,
      now: at("2026-10-07", 7, 50),
      serviceDate: "2026-10-07",
      dayType: "weekday",
      validFrom: () => VALID_FROM,
    });
    const beAtOf = (o: BusOption, records: PassageRecord[]) =>
      busCandidates(o, input(o, records)).find((c) => c.tripId === tripId(P1, "weekday", hm(8, 10)))!.beAtStop;
    const base = beAtOf(option(P1), []);
    expect(beAtOf(option(FAM), old)).toBeGreaterThan(base + 1);
    expect(beAtOf(option(P1), old)).toBe(base);
  });

  it("(ii) planDepartures: com family na opção o leaveAt muda pelo mesmo desvio; sem family, não", () => {
    const opt = (pattern: AlarmOption["pattern"]): AlarmOption => ({
      id: "casa-facul-l1",
      pattern,
      boardPosition: 2,
      alightPosition: 10,
      walkToBoard: { min: 6, max: null },
      walkAfterAlight: { min: 5, max: null },
      rideMinutes: [],
      lineCode: "1",
      boardStopName: "Arrabalde da Ponte",
    });
    const alarm: AlarmRule = {
      id: "A",
      optionId: "casa-facul-l1",
      anchorTripId: tripId(P1, "weekday", hm(8, 10)),
      anchorBaseMinute: hm(8, 12),
      weekdays: [],
      onceDate: "2026-10-07",
      validFrom: "2026-10-01",
      validTo: null,
      enabled: true,
    };
    const leave = (pattern: AlarmOption["pattern"], records: PassageRecord[]) =>
      planDepartures({
        alarms: [alarm],
        options: [opt(pattern)],
        now: at("2026-10-06", 7, 0),
        dayData: (date) => {
          const dayType = dayTypeOf(date, NETWORK.calendar);
          const running = new Set(tripsRunningOn(date, dayType.dayType, NETWORK.schedule).map((t) => t.id));
          return { trips: NETWORK.trips.filter((t) => running.has(t.id)), records, dayType, validFrom: () => VALID_FROM, seasonExcluded: false };
        },
      }).departures[0]!.leaveAt;
    const base = leave(P1, []);
    expect(leave(FAM, old)).toBeGreaterThan(base);
    expect(leave(P1, old)).toBe(base);
  });
});
