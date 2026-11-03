/// <reference types="node" />
// Dados inventados (D-091). Prova de ponta a ponta do motivo "data sem serviço": domínio da pista → reasonOf → texto → cartão.
// Só passa com o domínio desta pista (ideia 217): `data_sem_servico` e `notOn` não existem no domínio da main.
import { lineServiceOn } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { importMobilis, type ImportDb } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { exampleSeed } from "../db/testing/exampleSeed";
import { lineScheduleOf, buildStopCard, reasonOf } from "./stopCard";
import { reasonText } from "./stopCardText";
import { loadSchedule, type ScheduleSnapshot } from "./schedule";

/** O banco ainda não guarda `notOn` (C2): o teste põe a data direto nas viagens de fim de semana já carregadas. */
async function snapshotWithNotOn(): Promise<ScheduleSnapshot> {
  const { db, sqlite } = testDbWithSqlite();
  const importDb: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(importDb, exampleSeed("2025-06-01"));
  const snap = await loadSchedule(db);
  const trips = snap.schedule.trips.map((t) => (t.dayTypes.includes("sunday_holiday") ? { ...t, notOn: ["2026-12-25"] } : t));
  return { ...snap, schedule: { ...snap.schedule, trips } };
}

describe("data sem serviço até a tela", () => {
  it("o domínio, o motivo e o texto", async () => {
    const snap = await snapshotWithNotOn();
    const service = lineServiceOn("2026-12-25", snap.calendar, snap.schedule);
    expect(service).toMatchObject({ status: "none", reason: "data_sem_servico" });
    for (const forSheet of [false, true]) {
      expect(reasonOf("data_sem_servico", "2026-12-25", snap.calendar, lineScheduleOf([], snap), forSheet)).toEqual({ kind: "date_off" });
    }
    expect(reasonText({ kind: "date_off" })).toBe("Não circula neste dia");
  });

  it("o cartão de 25/12/2026 traz later com date_off e a próxima data", async () => {
    const snap = await snapshotWithNotOn();
    const stopId = exampleSeed("2025-06-01").stops.find((s) => s.key === "mobilis/stop/9001")!.id;
    const instant = Date.parse("2026-12-25T10:00:00Z"); // inverno: UTC+0
    const card = buildStopCard(stopId, snap, instant);
    expect(card?.lines[0]?.state).toMatchObject({ status: "later", reason: { kind: "date_off" }, date: "2026-12-26" });
  });
});
