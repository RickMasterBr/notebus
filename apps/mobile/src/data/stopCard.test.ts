/// <reference types="node" />
// Dados inventados (D-091). Percurso de 3 paragens: Praça Inventada (1) → Rua Exemplo (2) → Largo Fictício (3).
// Viagem de dia útil: 08:10 / 08:17 / 08:24 (490, 497, 504). Viagem de fim de semana: 09:00 (540…), sem julho e agosto.
import { type PassageRecord, type SeedFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { boardChoices } from "./boardChoices";
import { passageTarget } from "./records";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";
import { type NextBus, type NextDay, buildStopCard, clockText, seasonMonths } from "./stopCard";
import { learnedFixture, learnedStopId, learnedTripIdOf } from "./learnedFixture";
import { lisbon } from "./registroFixture";

async function load(seed: SeedFile): Promise<ScheduleSnapshot> {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, seed);
  return loadSchedule(db);
}

/** Variante do arquivo inventado: só as viagens pedidas, e (opcional) sem o horário da paragem do meio. */
function seedWith(options: { only?: "weekday" | "weekend"; middleInterpolated?: boolean; weekendMinuteShift?: number } = {}): SeedFile {
  const seed = exampleSeed("2025-06-01");
  const keep = (key: string) =>
    options.only === undefined ? true : options.only === "weekday" ? key.includes("/trip/L1/0810") : key.includes("/trip/L1/0900");
  const trips = seed.trips.filter((t) => keep(t.key));
  const ids = new Set(trips.map((t) => t.id));
  let stopTimes = seed.stopTimes.filter((st) => ids.has(st.tripId));
  if (options.middleInterpolated) stopTimes = stopTimes.filter((st) => !st.key.endsWith("/pos/2"));
  if (options.weekendMinuteShift) {
    stopTimes = stopTimes.map((st) =>
      st.key.includes("/trip/L1/0900") ? { ...st, serviceMinute: st.serviceMinute + options.weekendMinuteShift! } : st,
    );
  }
  return { ...seed, trips, stopTimes };
}

/** Instante de um relógio de parede em Lisboa. `summer` = hora de verão (UTC+1, de março a outubro). */
const lisbon = (date: string, hhmm: string, summer = true) =>
  Date.parse(`${date}T${hhmm}:00Z`) - (summer ? 3_600_000 : 0);

const PRACA = "mobilis/stop/9001"; // Praça Inventada
const RUA = "mobilis/stop/L1/2";
const LARGO = "mobilis/stop/L1/3";

async function cardOf(key: string, seed: SeedFile, instant: number) {
  const snapshot = await load(seed);
  const id = seed.stops.find((s) => s.key === key)!.id;
  return buildStopCard(id, snapshot, instant);
}

describe("loadSchedule", () => {
  it("lê o importado para o formato do domínio", async () => {
    const snapshot = await load(exampleSeed("2025-06-01"));
    expect(snapshot.patterns).toHaveLength(1);
    expect(snapshot.patterns[0]!.stops.map((s) => s.position).sort()).toEqual([1, 2, 3]);
    expect(snapshot.trips).toHaveLength(2);
    expect(snapshot.trips.map((t) => t.stopTimes.length)).toEqual([3, 3]);
    expect([...snapshot.patternLine.values()]).toEqual([{ code: "1", color: "#7A3FF2" }]);
    expect([...snapshot.stopNames.values()].sort()).toEqual(["Largo Fictício", "Praça Inventada", "Rua Exemplo"]);
    expect(snapshot.schedule.trips.map((t) => t.dayTypes.sort())).toEqual(
      expect.arrayContaining([["weekday"], ["saturday", "sunday_holiday"]]),
    );
    expect(snapshot.schedule.seasons).toHaveLength(1);
    expect(snapshot.calendar.holidays.map((h) => h.date)).toEqual(["2026-06-13", "2027-06-13"]);
  });
});

describe("buildStopCard: próximo ônibus", () => {
  it("quinta 08:00: a das 08:10, faixa ±2 e esteja no ponto às 08:06 (D-019, D-092)", async () => {
    const card = await cardOf(PRACA, seedWith(), lisbon("2026-09-03", "08:00"));
    expect(card?.name).toBe("Praça Inventada");
    expect(card?.lines).toHaveLength(1);
    expect(card?.lines[0]).toEqual({
      code: "1",
      color: "#7A3FF2",
      destination: "Largo Fictício",
      state: { status: "next", time: "08:10", rangeStart: "08:08", rangeEnd: "08:12", beAtStop: "08:06", confidence: "estimated", mayPassNow: false },
    });
  });

  it("às 08:10 em ponto ainda é o próximo; às 08:11 já não", async () => {
    const seed = seedWith({ only: "weekday" });
    const at0810 = await cardOf(PRACA, seed, lisbon("2026-09-03", "08:10"));
    expect(at0810?.lines[0]?.state.status).toBe("next");
    const at0811 = await cardOf(PRACA, seed, lisbon("2026-09-03", "08:11"));
    expect(at0811?.lines[0]?.state).toMatchObject({ status: "later" });
  });

  it("paragem sem horário na tabela: interpola e alarga a faixa (±4), esteja às 08:11", async () => {
    const card = await cardOf(RUA, seedWith({ middleInterpolated: true }), lisbon("2026-09-03", "08:00"));
    expect(card?.lines[0]?.state).toEqual({
      status: "next", time: "08:17", rangeStart: "08:13", rangeEnd: "08:21", beAtStop: "08:11", confidence: "estimated", mayPassNow: false,
    });
  });

  it("a madrugada de domingo olha o dia de serviço de sábado (hora de serviço 24:10 = 00:10)", async () => {
    const seed = seedWith({ weekendMinuteShift: 910 }); // 540 + 910 = 1450
    const card = await cardOf(PRACA, seed, lisbon("2026-09-06", "00:05"));
    expect(card?.lines[0]?.state).toMatchObject({ status: "next", time: "00:10", beAtStop: "00:06" });
  });

  it("relógio de inverno (UTC+0) também vale: 25/10/2026 passou", async () => {
    const card = await cardOf(PRACA, seedWith(), lisbon("2026-12-03", "08:00", false));
    expect(card?.lines[0]?.state).toMatchObject({ status: "next", time: "08:10" });
  });
});

describe("buildStopCard: sem mais ônibus ou sem serviço", () => {
  it("acabaram os de hoje: próximo dia com serviço, sem motivo", async () => {
    const card = await cardOf(PRACA, seedWith(), lisbon("2026-09-03", "08:30")); // quinta
    // quinta tem a das 08:10 (passou); sexta tem a mesma
    expect(card?.lines[0]?.state).toEqual({ status: "later", reason: null, date: "2026-09-04", weekday: 5, time: "08:10" });
  });

  it("domingo à tarde: acabou a das 09:00; segunda 08:10", async () => {
    const card = await cardOf(PRACA, seedWith(), lisbon("2026-09-06", "10:00"));
    expect(card?.lines[0]?.state).toEqual({ status: "later", reason: null, date: "2026-09-07", weekday: 1, time: "08:10" });
  });

  it("sábado em julho: época sem serviço (julho e agosto) e o próximo dia útil", async () => {
    const card = await cardOf(PRACA, seedWith(), lisbon("2026-07-18", "10:00"));
    expect(card?.lines[0]?.state).toEqual({
      status: "later", reason: { kind: "season", months: [7, 8] }, date: "2026-07-20", weekday: 1, time: "08:10",
    });
  });

  it("linha só de dias úteis no sábado", async () => {
    const card = await cardOf(PRACA, seedWith({ only: "weekday" }), lisbon("2026-09-05", "10:00"));
    expect(card?.lines[0]?.state).toEqual({
      status: "later", reason: { kind: "weekdays_only" }, date: "2026-09-07", weekday: 1, time: "08:10",
    });
  });

  it("feriado nacional (terça 08/12) numa linha só de dias úteis: usa a tabela de domingo/feriado", async () => {
    const card = await cardOf(PRACA, seedWith({ only: "weekday" }), lisbon("2026-12-08", "07:00", false));
    expect(card?.lines[0]?.state).toEqual({
      status: "later", reason: { kind: "sunday_holiday" }, date: "2026-12-09", weekday: 3, time: "08:10",
    });
  });

  it("feriado municipal (sábado 13/06/2026) também vira domingo/feriado: a linha só de dias úteis não circula", async () => {
    const card = await cardOf(PRACA, seedWith({ only: "weekday" }), lisbon("2026-06-13", "07:00"));
    expect(card?.lines[0]?.state).toMatchObject({ status: "later", reason: { kind: "weekdays_only" }, date: "2026-06-15" });
  });

  it("linha só de fim de semana num dia útil: a 4.6 não tem frase, então sem motivo", async () => {
    const card = await cardOf(PRACA, seedWith({ only: "weekend" }), lisbon("2026-09-02", "10:00"));
    expect(card?.lines[0]?.state).toEqual({ status: "later", reason: null, date: "2026-09-05", weekday: 6, time: "09:00" });
  });

  it("ponto onde toda viagem termina não oferece embarque", async () => {
    const card = await cardOf(LARGO, seedWith(), lisbon("2026-09-03", "08:00"));
    expect(card?.lines[0]?.state).toEqual({ status: "none", reason: null });
  });

  it("ponto que não existe mais: sem cartão", async () => {
    const snapshot = await load(seedWith());
    expect(buildStopCard("nao-existe", snapshot, lisbon("2026-09-03", "08:00"))).toBeNull();
  });
});

describe("auxiliares", () => {
  it("clockText: hora de relógio, também depois da meia-noite", () => {
    expect(clockText(490)).toBe("08:10");
    expect(clockText(1450)).toBe("00:10");
    expect(clockText(-5)).toBe("23:55");
  });
  it("seasonMonths: intervalo anual, com virada de ano", () => {
    expect(seasonMonths("07-01", "08-31")).toEqual([7, 8]);
    expect(seasonMonths("12-15", "01-15")).toEqual([12, 1]);
    expect(seasonMonths("06-01", "06-30")).toEqual([6]);
  });
});

import { declaredPassageKeys } from "./stopCard";

describe("declaredPassageKeys (selo 'declarado', E-08)", () => {
  it("só as posições com horário declarado, por viagem", () => {
    const trips = [
      { id: "t1", patternId: "p", firstPosition: 1, lastPosition: 3, stopTimes: [{ position: 1, serviceMinute: 490, origin: "official" as const }, { position: 2, serviceMinute: 494, origin: "declared" as const }] },
      { id: "t2", patternId: "p", firstPosition: 1, lastPosition: 3, stopTimes: [{ position: 2, serviceMinute: 500, origin: "official" as const }] },
    ];
    expect([...declaredPassageKeys(trips)]).toEqual(["t1:2"]);
  });
});

describe("buildStopCard: aprendizado (E-08.5 bloco 10, T-130)", () => {
  it("sem registros: resultado idêntico à chamada sem o parâmetro", async () => {
    const snapshot = await load(seedWith());
    const id = snapshot.stopNames.keys().next().value!;
    const instant = lisbon("2026-09-02", "08:00");
    expect(buildStopCard(id, snapshot, instant, [])).toEqual(buildStopCard(id, snapshot, instant));
  });

  it("T-130: 4 registros auto de desvio +6 na viagem das 08:10 -> horário base + 6 (08:16) e igual ao de boardChoices", async () => {
    const seed = seedWith({ only: "weekday" });
    const snapshot = await load(seed);
    const stopId = seed.stops.find((s) => s.key === PRACA)!.id;
    const instant = lisbon("2026-09-02", "08:00");
    const seedTrip = seed.trips.find((t) => t.key.includes("/trip/L1/0810"))!;
    const trip = snapshot.trips.find((t) => t.id === seedTrip.id)!;
    const target = passageTarget(snapshot, trip.id, 1, "2026-09-02", "weekday")!;
    // 4 registros com desvio +6 (490 + 6 = 496, "08:16"):
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: instant - d * 86_400_000,
      serviceDate: "2026-09-02",
      dayType: target.dayType,
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));
    const card = buildStopCard(stopId, snapshot, instant, records)!;
    expect(card).not.toBeNull();
    const state = card.lines[0]!.state as NextBus;
    expect(state.status).toBe("next");
    expect(state.time).toBe("08:16"); // 08:10 + 6 min
    expect(state.confidence).toBe("medium");

    // Compara com boardChoices chamado no mesmo teste:
    const choices = boardChoices(stopId, snapshot, records, instant);
    const choice = choices.find((c) => c.tripId === trip.id);
    expect(choice).toBeDefined();
    expect(state.time).toBe(choice!.time);
  });

  it("mudança do próximo: aprendizado empurra a passagem para depois de agora (às 08:12, base 08:10 já passou, mas aprendida 08:16 continua próxima)", async () => {
    const seed = seedWith({ only: "weekday" });
    const snapshot = await load(seed);
    const stopId = seed.stops.find((s) => s.key === PRACA)!.id;
    const at0812 = lisbon("2026-09-02", "08:12"); // minuto 492
    const seedTrip = seed.trips.find((t) => t.key.includes("/trip/L1/0810"))!;
    const trip = snapshot.trips.find((t) => t.id === seedTrip.id)!;
    const target = passageTarget(snapshot, trip.id, 1, "2026-09-02", "weekday")!;

    // Sem registros: 08:10 já passou (490 < 492), próximo dia útil
    const unlearned = buildStopCard(stopId, snapshot, at0812, [])!;
    expect(unlearned.lines[0]!.state.status).toBe("later");

    // Com 4 registros de +6 (esperado 496, 08:16 >= 492): ainda é o próximo!
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: at0812 - d * 86_400_000,
      serviceDate: "2026-09-02",
      dayType: target.dayType,
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));
    const learned = buildStopCard(stopId, snapshot, at0812, records)!;
    expect(learned.lines[0]!.state.status).toBe("next");
    expect((learned.lines[0]!.state as NextBus).time).toBe("08:16");
  });

  it("L18: cartão do dia seguinte aprende (+6) na primeira viagem de amanhã", async () => {
    const { data } = await learnedFixture();
    const stopId = learnedStopId("S");
    // Quarta-feira 07/10/2026 às 10:00: as viagens de hoje da Linha 1 (08:10 e 08:40) já terminaram
    const instant10h = lisbon("2026-10-07", "10:00");
    const tripId = learnedTripIdOf("1", "0810");
    const target = passageTarget(data, tripId, 1, "2026-10-08", "weekday")!;
    expect(target).toBeDefined();

    // 4 registros auto de +6 na primeira viagem do dia seguinte (L1 08:10 pos 1, base 490):
    // Conta: base 490 (08:10) + desvio 6 min = 496 ("08:16").
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 6,
      observedAt: instant10h - d * 86_400_000,
      serviceDate: "2026-10-08",
      dayType: "weekday",
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto",
      mode: "live",
      kind: "boarded",
    }));

    const card = buildStopCard(stopId, data, instant10h, records)!;
    expect(card).not.toBeNull();
    const line1 = card.lines.find((l) => l.code === "1")!;
    expect(line1.state.status).toBe("later");
    // Com aprendizado: 08:16. Com records=[] (mutação): 08:10.
    expect((line1.state as NextDay).time).toBe("08:16");
  });

  it("L21: recência em stopCard: 3 registros de +10 com 200 dias e 1 registro de +2 de hoje", async () => {
    const { data } = await learnedFixture();
    const stopId = learnedStopId("S");
    const instant = lisbon("2026-10-08", "08:00");
    const tripId = learnedTripIdOf("1", "0810");
    const target = passageTarget(data, tripId, 1, "2026-10-08", "weekday")!;

    // 3 registros de +10 com 200 dias de idade: peso = 0.5^(200/28) ≈ 0.007 cada (soma ≈ 0.021).
    // 1 registro de +2 de hoje: peso = 1.
    // Com now correto (instant), o registro recente domina (peso 1 contra 0.021):
    // Mediana local dos desvios ponderados: +2.
    // Com encolhimento (k=3), o centro fica próximo de +2: base 490 (08:10) + 2 min = 492 ("08:12").
    // Com now = 0, todos os 4 registros teriam peso 1, mediana dos desvios = +10, horário = "08:20".
    const oldObs = instant - 200 * 86_400_000;
    const records: PassageRecord[] = [
      {
        deviation: 10,
        observedAt: oldObs,
        serviceDate: "2026-03-22",
        dayType: "weekday",
        tripId: target.tripId,
        patternId: target.patternId,
        position: target.position,
        stopId: target.stopId,
        matchStatus: "auto",
        mode: "live",
        kind: "boarded",
      },
      {
        deviation: 10,
        observedAt: oldObs,
        serviceDate: "2026-03-21",
        dayType: "weekday",
        tripId: target.tripId,
        patternId: target.patternId,
        position: target.position,
        stopId: target.stopId,
        matchStatus: "auto",
        mode: "live",
        kind: "boarded",
      },
      {
        deviation: 10,
        observedAt: oldObs,
        serviceDate: "2026-03-20",
        dayType: "weekday",
        tripId: target.tripId,
        patternId: target.patternId,
        position: target.position,
        stopId: target.stopId,
        matchStatus: "auto",
        mode: "live",
        kind: "boarded",
      },
      {
        deviation: 2,
        observedAt: instant,
        serviceDate: "2026-10-08",
        dayType: "weekday",
        tripId: target.tripId,
        patternId: target.patternId,
        position: target.position,
        stopId: target.stopId,
        matchStatus: "auto",
        mode: "live",
        kind: "boarded",
      },
    ];

    const card = buildStopCard(stopId, data, instant, records)!;
    const line1 = card.lines.find((l) => l.code === "1")!;
    expect(line1.state.status).toBe("next");
    expect((line1.state as NextBus).time).toBe("08:12");
  });
});
