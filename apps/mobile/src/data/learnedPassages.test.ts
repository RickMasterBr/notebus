/// <reference types="node" />
/**
 * Testes para learnedPassage, learnedPassages e aheadServiceDay (E-08.5 bloco 10, A1, A5, D-191).
 */
import {
  type PassageRecord,
  type StopPassage,
  expectedTime,
  passagesAtStop,
} from "@notebus/domain";
import { describe, expect, it } from "vitest";
import {
  aheadServiceDay,
  learnedPassage,
  learnedPassages,
} from "./learnedPassages";
import { passageTarget } from "./records";
import {
  THURSDAY,
  fixture,
  lisbon,
  stopId,
  tripIdOf,
} from "./registroFixture";
import {
  learnedFixture,
  learnedStopId,
  learnedTripIdOf,
} from "./learnedFixture";

describe("learnedPassage e learnedPassages (Item 1)", () => {
  it("sem registros: devolve a mesma referência (toBe) e learnedPassages mantém a ordem", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });
    expect(passages.length).toBeGreaterThan(1);

    const first = passages[0]!;
    const ctx = {
      records: [],
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };

    const learned = learnedPassage(first, data, ctx);
    expect(learned).toBe(first);

    const allLearned = learnedPassages(passages, data, ctx);
    expect(allLearned).toEqual(passages);
    allLearned.forEach((p, idx) => {
      expect(p).toBe(passages[idx]);
    });
  });

  it("quatro registros auto de desvio +6 da mesma viagem, posição e tipo de dia recalculam center = base + 6 com confidence medium", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });
    // Viagem das 08:10 da L1 na Arrabalde (posição 2, base 492)
    const targetPassage = passages.find((p) => p.tripId === tripIdOf("1", "0810") && p.info.position === 2)!;
    expect(targetPassage).toBeDefined();

    // 4 registros auto de desvio +6 na mesma viagem, posição e tipo de dia:
    // Nível mais específico: 'trip' (4 registros).
    // A mediana local é 6 e a mediana do nível superior (o ponto) também é 6.
    // O centro encolhido é (4 * 6 + 3 * 6) / 7 = 6 minutos.
    // Portanto: expected.center = targetPassage.base.minute + 6 = 492 + 6 = 498.
    // Como 3 <= count < 6 (count = 4), a confiança dada pelo domínio é 'medium'.
    const records: PassageRecord[] = [1, 2, 3, 4].map((day) => ({
      deviation: 6,
      observedAt: now - day * 86_400_000,
      serviceDate: `2026-10-0${day}`,
      dayType: "weekday" as const,
      tripId: targetPassage.tripId,
      patternId: targetPassage.patternId,
      position: targetPassage.info.position,
      stopId: stopId("A"),
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const ctx = {
      records,
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };

    const learned = learnedPassage(targetPassage, data, ctx);
    expect(learned.expected.center).toBe(targetPassage.base.minute + 6);
    expect(learned.expected.confidence).toBe("medium");

    // Faixa e beAtStop conferidos contra chamada direta a expectedTime do domínio
    const directExpected = expectedTime(targetPassage.base, records, {
      target: {
        tripId: targetPassage.tripId,
        patternId: targetPassage.patternId,
        position: targetPassage.info.position,
        stopId: stopId("A"),
        dayType: "weekday",
        validFrom: "2026-01-01",
      },
      now,
      marginMinutes: data.margin,
    });
    expect(learned.expected.rangeStart).toBe(directExpected.rangeStart);
    expect(learned.expected.rangeEnd).toBe(directExpected.rangeEnd);
    expect(learned.expected.beAtStop).toBe(directExpected.beAtStop);
  });

  it("recência de now: com 6 registros antigos (> 56 dias), a confiança é medium (com now=0 viraria falsamente high)", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });
    const targetPassage = passages.find((p) => p.tripId === tripIdOf("1", "0810") && p.info.position === 2)!;

    // 6 registros com mais de 70 dias (> recentWindowDays de 56 dias):
    // Como count = 6, se fossem recentes (<= 56 dias) a confiança seria 'high'.
    // Mas como têm > 56 dias, recentCount = 0 e a confiança fica em 'medium'.
    const records: PassageRecord[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      deviation: 6,
      observedAt: now - (70 + i) * 86_400_000,
      serviceDate: `2026-07-0${i}`,
      dayType: "weekday" as const,
      tripId: targetPassage.tripId,
      patternId: targetPassage.patternId,
      position: targetPassage.info.position,
      stopId: stopId("A"),
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const ctx = {
      records,
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };

    const learned = learnedPassage(targetPassage, data, ctx);
    expect(learned.expected.confidence).toBe("medium");
  });

  it("A5: os mesmos 4 registros de dia útil com ctx.dayType saturday não afetam a passagem (confidence estimated), mas com weekday aprendem", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });
    const targetPassage = passages.find((p) => p.tripId === tripIdOf("1", "0810") && p.info.position === 2)!;

    const records: PassageRecord[] = [1, 2, 3, 4].map((day) => ({
      deviation: 6,
      observedAt: now - day * 86_400_000,
      serviceDate: `2026-10-0${day}`,
      dayType: "weekday" as const,
      tripId: targetPassage.tripId,
      patternId: targetPassage.patternId,
      position: targetPassage.info.position,
      stopId: stopId("A"),
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    // No Ponto, o chip 'Sábado' troca o dayType mantendo a data de hoje (THURSDAY, dia útil) - A5
    const satCtx = {
      records,
      date: THURSDAY,
      dayType: "saturday" as const,
      now,
    };
    const satLearned = learnedPassage(targetPassage, data, satCtx);
    expect(satLearned.expected.center).toBe(targetPassage.base.minute);
    expect(satLearned.expected.confidence).toBe("estimated");
    expect(satLearned.expected).toEqual(targetPassage.expected);

    // Com ctx.dayType: 'weekday', aprende normalmente (+6 min)
    const weekdayCtx = {
      records,
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };
    const weekdayLearned = learnedPassage(targetPassage, data, weekdayCtx);
    expect(weekdayLearned.expected.center).toBe(targetPassage.base.minute + 6);
    expect(weekdayLearned.expected.confidence).toBe("medium");
  });

  it("registro ambiguous ou orphan não conta (filtro do domínio)", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });
    const targetPassage = passages.find((p) => p.tripId === tripIdOf("1", "0810") && p.info.position === 2)!;

    const records: PassageRecord[] = [
      {
        deviation: 6,
        observedAt: now,
        serviceDate: THURSDAY,
        dayType: "weekday",
        tripId: targetPassage.tripId,
        patternId: targetPassage.patternId,
        position: targetPassage.info.position,
        stopId: stopId("A"),
        matchStatus: "ambiguous" as any,
        mode: "live",
        kind: "boarded",
      },
      {
        deviation: 6,
        observedAt: now,
        serviceDate: THURSDAY,
        dayType: "weekday",
        tripId: targetPassage.tripId,
        patternId: targetPassage.patternId,
        position: targetPassage.info.position,
        stopId: stopId("A"),
        matchStatus: "orphan" as any,
        mode: "live",
        kind: "boarded",
      },
    ];

    const ctx = {
      records,
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };

    const learned = learnedPassage(targetPassage, data, ctx);
    // Registros não aceitos são ignorados pelo domínio -> continua estimated com center = base.minute
    expect(learned.expected.center).toBe(targetPassage.base.minute);
    expect(learned.expected.confidence).toBe("estimated");
  });

  it("learnedPassages reordena quando o aprendizado inverte duas passagens com base.minute próximos", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "08:00");
    const passages = passagesAtStop(stopId("A"), data.patterns, data.trips, { marginMinutes: data.margin });

    // Na Arrabalde:
    // Passage A: L1 08:10 (posição 2), base.minute = 492 (08:12)
    // Passage B: L3 08:00 (posição 1), base.minute = 500 (08:20)
    // Normalmente, Passage A (492) vem antes de Passage B (500).
    const pA = passages.find((p) => p.tripId === tripIdOf("1", "0810") && p.info.position === 2)!;
    const pB = passages.find((p) => p.tripId === tripIdOf("3", "0800") && p.info.position === 1)!;
    expect(pA.base.minute).toBe(492);
    expect(pB.base.minute).toBe(500);

    // Damos 4 registros de +15 minutos para Passage A (492 + 15 = 507).
    // Passage B não tem registros (expected.center = 500).
    // Com aprendizado: Passage B (500) deve passar na frente de Passage A (507).
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 15,
      observedAt: now - d * 86_400_000,
      serviceDate: `2026-10-0${d}`,
      dayType: "weekday" as const,
      tripId: pA.tripId,
      patternId: pA.patternId,
      position: pA.info.position,
      stopId: stopId("A"),
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const ctx = {
      records,
      date: THURSDAY,
      dayType: "weekday" as const,
      now,
    };

    const ordered = learnedPassages([pA, pB], data, ctx);
    // Ordem esperada: primeiro pB (500), depois pA (507)
    expect(ordered[0]!.tripId).toBe(pB.tripId);
    expect(ordered[1]!.tripId).toBe(pA.tripId);
    expect(ordered[0]!.expected.center).toBe(500);
    expect(ordered[1]!.expected.center).toBe(507);
  });

  it("L17: desempate por base.minute quando expected.center é igual", async () => {
    const { data } = await fixture();
    const p1: StopPassage = {
      tripId: "t1",
      patternId: "p1",
      base: { minute: 500, kind: "official", position: 1 },
      expected: {
        center: 510,
        rangeStart: 508,
        rangeEnd: 512,
        beAtStop: 506,
        confidence: "medium",
        baseKind: "official",
      },
      info: { position: 1, number: null, origin: null, destination: null, stopId: "s1", isFirst: true, isLast: false },
    };
    const p2: StopPassage = {
      tripId: "t2",
      patternId: "p1",
      base: { minute: 490, kind: "official", position: 2 },
      expected: {
        center: 510,
        rangeStart: 508,
        rangeEnd: 512,
        beAtStop: 506,
        confidence: "medium",
        baseKind: "official",
      },
      info: { position: 2, number: null, origin: null, destination: null, stopId: "s1", isFirst: false, isLast: true },
    };
    const ctx = { records: [], date: THURSDAY, dayType: "weekday" as const, now: 0 };
    const ordered = learnedPassages([p1, p2], data, ctx);
    expect(ordered[0]!.base.minute).toBe(490);
    expect(ordered[1]!.base.minute).toBe(500);
  });
});

describe("aheadServiceDay (Item 3.1)", () => {
  it("viagem de sábado aberta numa quarta cai no terceiro caso (retorna a data de hoje e o tipo da viagem: saturday)", async () => {
    const { data } = await learnedFixture();
    // Quarta-feira 07/10/2026
    const wednesdayNow = lisbon("2026-10-07", "10:00");
    const satTripId = learnedTripIdOf("1", "0810_sat");

    const result = aheadServiceDay(data, satTripId, wednesdayNow);
    expect(result).toEqual({
      date: "2026-10-07",
      dayType: "saturday",
    });
  });

  it("viagem que circula nos dois dias vale hoje", async () => {
    const { data } = await learnedFixture();
    // Quinta-feira 08/10/2026 (dia útil)
    const thursdayNow = lisbon(THURSDAY, "10:00");
    const bothTripId = learnedTripIdOf("2", "0830_both");

    const result = aheadServiceDay(data, bothTripId, thursdayNow);
    expect(result).toEqual({
      date: THURSDAY,
      dayType: "weekday",
    });
  });

  it("depois da meia-noite com a viagem de ontem vale ontem", async () => {
    const { data } = await learnedFixture();
    // Domingo 11/10/2026 às 00:05 (meia-noite de domingo).
    // O dia de serviço de hoje é domingo (2026-10-11).
    // O dia de serviço de ontem é sábado (2026-10-10).
    // A viagem '0005_sat' circula no sábado às 24:05 (1445 min), mas não no domingo.
    const sundayEarly = lisbon("2026-10-11", "00:05");
    const lateTripId = learnedTripIdOf("1", "0005_sat");

    const result = aheadServiceDay(data, lateTripId, sundayEarly);
    expect(result).toEqual({
      date: "2026-10-10",
      dayType: "saturday",
    });
  });

  it("retorna null se a viagem não existe", async () => {
    const { data } = await fixture();
    const now = lisbon(THURSDAY, "10:00");
    expect(aheadServiceDay(data, "trip_inexistente", now)).toBeNull();
  });
});

describe("passageTarget (L22)", () => {
  it("passageTarget(data, trip, pos, '') devolve null", async () => {
    const { data } = await fixture();
    const trip = tripIdOf("1", "0810");
    expect(passageTarget(data, trip, 1, "")).toBeNull();
  });
});
