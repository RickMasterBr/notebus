/// <reference types="node" />
// Dados inventados (D-091). Percurso de 3 paragens: Praça Inventada (1) → Rua Exemplo (2) → Largo Fictício (3).
// Viagem de dia útil: 08:10 / 08:17 / 08:24 (490, 497, 504). Viagem de fim de semana: 09:00 (540…), sem julho e agosto.
import { type SeedFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";
import { buildStopCard, clockText, seasonMonths } from "./stopCard";

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
