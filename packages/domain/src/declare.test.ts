import { describe, expect, it } from "vitest";
import {
  DECLARE_NIGHT_CUTOFF_MINUTES,
  declaredServiceMinute,
  passageChoices,
  planDeclaration,
  type DeclareTrip,
} from "./declare.ts";
import { DOMAIN_CONFIG } from "./config.ts";
import { passagesAtStop, type PatternData } from "./passages.ts";
import type { DayTypeCode } from "./seedFormat.ts";

// Exemplo inventado (D-091), com a forma da L1: circular de 51 posições que passa três vezes no "Estádio".
// Nomes, IDs e horários não são os reais.
const ESTADIO = "stop-estadio";
const ARRABALDE = "stop-arrabalde";
const hm = (h: number, m: number) => h * 60 + m;
const pattern = (id: string, size: number, at: Record<number, string>): PatternData => ({
  id,
  stops: Array.from({ length: size }, (_, i) => ({ position: i + 1, stopId: at[i + 1] ?? `${id}-stop-${i + 1}`, isTimepoint: false })),
});
const L1 = pattern("pat-l1", 51, { 1: ESTADIO, 17: ESTADIO, 51: ESTADIO, 2: ARRABALDE });
const trip = (
  id: string,
  patternId: string,
  dayTypes: DayTypeCode[],
  times: [number, number, ("official" | "declared")?][],
  first?: number,
  last?: number,
): DeclareTrip => ({
  id,
  patternId,
  dayTypes,
  firstPosition: first ?? times[0]![0],
  lastPosition: last ?? times[times.length - 1]![0],
  stopTimes: times.map(([position, serviceMinute, origin]) => ({ position, serviceMinute, origin: origin ?? "official" })),
});
const WEEKDAY: DayTypeCode[] = ["weekday"];
const SATURDAY: DayTypeCode[] = ["saturday"];
// Base 08:12 e 08:42 na Arrabalde (pos. 2), as duas interpoladas (T-75, T-76).
const TRIP_0810 = trip("trip-0810", L1.id, WEEKDAY, [[1, hm(8, 10)], [6, hm(8, 20)], [17, hm(8, 45)], [51, hm(9, 30)]]);
const TRIP_0840 = trip("trip-0840", L1.id, WEEKDAY, [[1, hm(8, 40)], [6, hm(8, 50)], [17, hm(9, 15)], [51, hm(10, 0)]]);
// Base 09:40 na pos. 1 e 10:01 na pos. 17 (T-101).
const TRIP_0940 = trip("trip-0940", L1.id, WEEKDAY, [[1, hm(9, 40)], [17, hm(10, 1)], [51, hm(10, 40)]]);

const plan = (over: Partial<Parameters<typeof planDeclaration>[0]> & Pick<Parameters<typeof planDeclaration>[0], "serviceMinute">) =>
  planDeclaration({ patterns: [L1], trips: [TRIP_0810, TRIP_0840], stopId: ARRABALDE, dayTypes: WEEKDAY, ...over });

describe("declaredServiceMinute", () => {
  it("00:00 a 03:59 vale como 24:00 a 27:59 do dia anterior; 04:00 em diante fica como é (D-111)", () => {
    expect(declaredServiceMinute(0, 20)).toBe(1460);
    expect(declaredServiceMinute(0, 0)).toBe(1440);
    expect(declaredServiceMinute(3, 59)).toBe(1679);
    expect(declaredServiceMinute(4, 0)).toBe(240);
    expect(declaredServiceMinute(23, 59)).toBe(1439);
  });

  it("o corte é 240 minutos", () => {
    expect(DECLARE_NIGHT_CUTOFF_MINUTES).toBe(240);
  });
});

describe("passageChoices", () => {
  it("L1 no Estádio passa 3 vezes no mesmo percurso: 1ª, 2ª, 3ª, por posição", () => {
    expect(passageChoices([L1], ESTADIO)).toEqual([
      { patternId: L1.id, position: 1, number: 1 },
      { patternId: L1.id, position: 17, number: 2 },
      { patternId: L1.id, position: 51, number: 3 },
    ]);
  });

  it("uma passagem só: uma escolha, sem número; ponto que a linha não serve: nenhuma", () => {
    expect(passageChoices([L1], ARRABALDE)).toEqual([{ patternId: L1.id, position: 2, number: null }]);
    expect(passageChoices([L1], "stop-nenhum")).toEqual([]);
  });

  it("L3 no Estádio: 1 passagem em cada um de dois percursos (posições 20 e 26): number null nas duas, na ordem recebida", () => {
    const L3a = pattern("pat-l3a", 30, { 20: ESTADIO });
    const L3b = pattern("pat-l3b", 30, { 26: ESTADIO });
    expect(passageChoices([L3a, L3b], ESTADIO)).toEqual([
      { patternId: "pat-l3a", position: 20, number: null },
      { patternId: "pat-l3b", position: 26, number: null },
    ]);
    expect(passageChoices([L3b, L3a], ESTADIO).map((c) => c.patternId)).toEqual(["pat-l3b", "pat-l3a"]);
  });

  it("percursos diferentes com repetição: ordem pelo percurso e depois pela posição", () => {
    const L9 = pattern("pat-l9", 10, { 3: ESTADIO, 8: ESTADIO });
    expect(passageChoices([L9, L1], ESTADIO).map((c) => `${c.patternId}:${c.position}:${c.number}`)).toEqual([
      "pat-l9:3:1",
      "pat-l9:8:2",
      "pat-l1:1:1",
      "pat-l1:17:2",
      "pat-l1:51:3",
    ]);
  });
});

describe("planDeclaration: casamento com a viagem que existe", () => {
  it("T-75: 08:14 casa com a viagem de base 08:12 (interpolada): update, replaces null, nenhuma viagem nova", () => {
    expect(plan({ serviceMinute: hm(8, 14) })).toEqual({
      ok: true,
      steps: [{ dayType: "weekday", action: "update", tripId: "trip-0810", patternId: L1.id, position: 2, replaces: null, alsoAffects: [] }],
    });
  });

  it("T-76: 08:30 fica a +18 e −12: create_partial", () => {
    expect(plan({ serviceMinute: hm(8, 30) })).toEqual({
      ok: true,
      steps: [{ dayType: "weekday", action: "create_partial", patternId: L1.id, position: 2 }],
    });
  });

  it("T-77: 13:32 onde há 13:30 oficial: update com replaces official 810", () => {
    const L2 = pattern("pat-l2", 5, { 3: "stop-campus" });
    const t = trip("trip-l2-1300", L2.id, WEEKDAY, [[1, hm(13, 0)], [3, hm(13, 30)], [5, hm(13, 50)]]);
    expect(planDeclaration({ patterns: [L2], trips: [t], stopId: "stop-campus", serviceMinute: hm(13, 32), dayTypes: WEEKDAY })).toEqual({
      ok: true,
      steps: [
        {
          dayType: "weekday", action: "update", tripId: t.id, patternId: L2.id, position: 3,
          replaces: { origin: "official", serviceMinute: 810 }, alsoAffects: [],
        },
      ],
    });
  });

  it("T-78: dia útil e sábado, viagem só no dia útil: um update e um create_partial", () => {
    const t = trip("trip-0735", L1.id, WEEKDAY, [[1, hm(7, 35)], [6, hm(7, 45)], [51, hm(8, 40)]]);
    const result = plan({ trips: [t], serviceMinute: hm(7, 40), dayTypes: ["weekday", "saturday"] });
    expect(result).toEqual({
      ok: true,
      steps: [
        { dayType: "weekday", action: "update", tripId: "trip-0735", patternId: L1.id, position: 2, replaces: null, alsoAffects: [] },
        { dayType: "saturday", action: "create_partial", patternId: L1.id, position: 2 },
      ],
    });
  });

  it("sábado e domingo sem casamento: duas create_partial, uma por tipo de dia, mesma posição (a gravação junta numa viagem)", () => {
    const result = plan({ serviceMinute: hm(8, 30), dayTypes: ["saturday", "sunday_holiday"] });
    expect(result).toEqual({
      ok: true,
      steps: [
        { dayType: "saturday", action: "create_partial", patternId: L1.id, position: 2 },
        { dayType: "sunday_holiday", action: "create_partial", patternId: L1.id, position: 2 },
      ],
    });
  });
});

describe("planDeclaration: tolerância −5/+15, inclusive (a do casamento de registros)", () => {
  const kinds = (minute: number) => {
    const r = plan({ serviceMinute: minute });
    return r.ok ? r.steps.map((s) => s.action) : r.reason;
  };

  it("lê a tolerância da configuração, nunca número solto", () => {
    expect(DOMAIN_CONFIG.matchEarlyMinutes).toBe(5);
    expect(DOMAIN_CONFIG.matchLateMinutes).toBe(15);
  });

  it("−5 e +15 servem; −6 e +16 não", () => {
    const base = hm(8, 12);
    expect(kinds(base - 5)).toEqual(["update"]);
    expect(kinds(base + 15)).toEqual(["update"]);
    expect(kinds(base - 6)).toEqual(["create_partial"]);
    expect(kinds(base + 16)).toEqual(["create_partial"]);
  });

  it("usa a configuração recebida", () => {
    const config = { ...DOMAIN_CONFIG, matchEarlyMinutes: 1, matchLateMinutes: 2 };
    const r = plan({ serviceMinute: hm(8, 12) + 3, config });
    expect(r.ok && r.steps.map((s) => s.action)).toEqual(["create_partial"]);
  });
});

describe("planDeclaration: qual viagem serve", () => {
  const mk = (id: string, base: number) => trip(id, L1.id, WEEKDAY, [[1, base - 10], [2, base], [6, base + 10]]);

  it("a de menor |delta|, não a primeira da lista", () => {
    const r = plan({ trips: [mk("p", hm(10, 0)), mk("q", hm(10, 6))], serviceMinute: hm(10, 7) });
    expect(r.ok && r.steps[0]).toMatchObject({ action: "update", tripId: "q" });
  });

  it("empate de |delta|: a de base mais cedo (qualquer ordem da lista)", () => {
    for (const trips of [[mk("x", hm(10, 0)), mk("y", hm(10, 10))], [mk("y", hm(10, 10)), mk("x", hm(10, 0))]]) {
      const r = plan({ trips, serviceMinute: hm(10, 5) });
      expect(r.ok && r.steps[0]).toMatchObject({ action: "update", tripId: "x" });
    }
  });

  it("ignora viagem que não circula no tipo de dia marcado", () => {
    const r = plan({ serviceMinute: hm(8, 14), dayTypes: SATURDAY });
    expect(r).toEqual({ ok: true, steps: [{ dayType: "saturday", action: "create_partial", patternId: L1.id, position: 2 }] });
  });

  it("viagem parcial que não chega à posição não é candidata", () => {
    const partialAt2 = trip("partial-2", L1.id, WEEKDAY, [[2, hm(9, 0, )]]);
    const r = plan({ trips: [partialAt2], stopId: ESTADIO, choice: { patternId: L1.id, position: 17 }, serviceMinute: hm(9, 0), dayTypes: WEEKDAY });
    expect(r.ok && r.steps[0]?.action).toBe("create_partial");
  });
});

describe("planDeclaration: alsoAffects", () => {
  it("lista os outros tipos de dia da viagem que a pessoa não marcou (o horário vale para a viagem inteira)", () => {
    const t = trip("trip-both", L1.id, ["saturday", "sunday_holiday"], [[1, hm(9, 0)], [6, hm(9, 10)], [51, hm(10, 0)]]);
    const r = plan({ trips: [t], serviceMinute: hm(9, 2), dayTypes: SATURDAY });
    expect(r.ok && r.steps[0]).toMatchObject({ action: "update", dayType: "saturday", alsoAffects: ["sunday_holiday"] });
  });

  it("marcou os dois: alsoAffects vazio", () => {
    const t = trip("trip-both", L1.id, ["saturday", "sunday_holiday"], [[1, hm(9, 0)], [6, hm(9, 10)], [51, hm(10, 0)]]);
    const r = plan({ trips: [t], serviceMinute: hm(9, 2), dayTypes: ["saturday", "sunday_holiday"] });
    expect(r.ok && r.steps.map((s) => s.action === "update" && s.alsoAffects)).toEqual([[], []]);
  });
});

describe("planDeclaration: declarar duas vezes o mesmo horário", () => {
  it("a parcial que já existe casa e é atualizada, sem segunda parcial (risco do §9)", () => {
    const first = plan({ serviceMinute: hm(8, 30) });
    expect(first.ok && first.steps[0]?.action).toBe("create_partial");
    const partial = trip("partial-0830", L1.id, WEEKDAY, [[2, hm(8, 30), "declared"]], 2, 2);
    const second = plan({ trips: [TRIP_0810, TRIP_0840, partial], serviceMinute: hm(8, 30) });
    expect(second).toEqual({
      ok: true,
      steps: [
        {
          dayType: "weekday", action: "update", tripId: "partial-0830", patternId: L1.id, position: 2,
          replaces: { origin: "declared", serviceMinute: hm(8, 30) }, alsoAffects: [],
        },
      ],
    });
  });

  it("depois do declare, passagesAtStop devolve a passagem declarada com a incerteza ±3", () => {
    const partial = trip("partial-0830", L1.id, WEEKDAY, [[2, hm(8, 30), "declared"]], 2, 2);
    const found = passagesAtStop(ARRABALDE, [L1], [TRIP_0810, TRIP_0840, partial]).find((p) => p.tripId === "partial-0830");
    expect(found?.base.kind).toBe("declared");
    expect(found?.expected.rangeStart).toBe(hm(8, 30) - DOMAIN_CONFIG.baseUncertainty.declared);
    expect(found?.expected.rangeEnd).toBe(hm(8, 30) + 3);
  });
});

describe("planDeclaration: passagem (D-121, T-101)", () => {
  const trips = [TRIP_0940];

  it("Estádio às 10:09 com a 2ª passagem entra na posição 17 da viagem das 09:40 (+8)", () => {
    const r = plan({ trips, stopId: ESTADIO, serviceMinute: hm(10, 9), choice: { patternId: L1.id, position: 17 } });
    expect(r).toEqual({
      ok: true,
      steps: [
        {
          dayType: "weekday", action: "update", tripId: "trip-0940", patternId: L1.id, position: 17,
          replaces: { origin: "official", serviceMinute: hm(10, 1) }, alsoAffects: [],
        },
      ],
    });
  });

  it("a escolha decide a posição: a 1ª passagem às 10:09 não casa (a viagem sai às 09:40: +29)", () => {
    const r = plan({ trips, stopId: ESTADIO, serviceMinute: hm(10, 9), choice: { patternId: L1.id, position: 1 } });
    expect(r.ok && r.steps[0]).toMatchObject({ action: "create_partial", position: 1 });
  });

  it("sem escolher, ou com escolha que não é do ponto: needs_passage", () => {
    expect(plan({ trips, stopId: ESTADIO, serviceMinute: hm(10, 9) })).toEqual({ ok: false, reason: "needs_passage" });
    expect(plan({ trips, stopId: ESTADIO, serviceMinute: hm(10, 9), choice: { patternId: L1.id, position: 2 } })).toEqual({
      ok: false,
      reason: "needs_passage",
    });
  });

  it("Arrabalde tem uma passagem: nenhuma escolha", () => {
    expect(plan({ serviceMinute: hm(8, 14) }).ok).toBe(true);
  });

  it("L3 no Estádio: duas passagens em dois percursos exigem escolha, e a escolha decide o percurso", () => {
    const L3a = pattern("pat-l3a", 30, { 20: ESTADIO });
    const L3b = pattern("pat-l3b", 30, { 26: ESTADIO });
    const ta = trip("l3a-1", L3a.id, WEEKDAY, [[1, hm(7, 0)], [20, hm(7, 40)], [30, hm(8, 0)]]);
    const tb = trip("l3b-1", L3b.id, WEEKDAY, [[1, hm(7, 0)], [26, hm(7, 41)], [30, hm(8, 0)]]);
    const base = { patterns: [L3a, L3b], trips: [ta, tb], stopId: ESTADIO, serviceMinute: hm(7, 41), dayTypes: WEEKDAY };
    expect(planDeclaration(base)).toEqual({ ok: false, reason: "needs_passage" });
    const b = planDeclaration({ ...base, choice: { patternId: "pat-l3b", position: 26 } });
    expect(b.ok && b.steps[0]).toMatchObject({ action: "update", tripId: "l3b-1", position: 26 });
    const a = planDeclaration({ ...base, choice: { patternId: "pat-l3a", position: 20 } });
    expect(a.ok && a.steps[0]).toMatchObject({ action: "update", tripId: "l3a-1", position: 20 });
  });
});

describe("planDeclaration: recusas", () => {
  it("sem tipo de dia: no_day_type", () => {
    expect(plan({ serviceMinute: hm(8, 14), dayTypes: [] })).toEqual({ ok: false, reason: "no_day_type" });
  });

  it("ponto que nenhum percurso serve: unknown_stop", () => {
    expect(plan({ serviceMinute: hm(8, 14), stopId: "stop-nenhum" })).toEqual({ ok: false, reason: "unknown_stop" });
  });

  it("tipo de dia repetido conta uma vez", () => {
    const r = plan({ serviceMinute: hm(8, 14), dayTypes: ["weekday", "weekday"] });
    expect(r.ok && r.steps).toHaveLength(1);
  });
});

describe("planDeclaration: madrugada", () => {
  it("00:20 declarado casa com a viagem das 24:20 (1460) do dia de serviço anterior", () => {
    const t = trip("trip-night", L1.id, WEEKDAY, [[1, 1450], [6, 1460], [51, 1500]]);
    const r = plan({ trips: [t], serviceMinute: declaredServiceMinute(0, 20) });
    expect(r.ok && r.steps[0]).toMatchObject({ action: "update", tripId: "trip-night" });
  });
});
