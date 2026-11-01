/// <reference types="node" />
// Dados inventados (D-091). Ideia 197: os horários de "Daqui para a frente" não descem ao longo do percurso.
import { type PassageRecord, type SeedFile } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { type ImportDb, importMobilis } from "../db/importMobilis";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { type LineSpec, lineSeed } from "../db/testing/lineSeed";
import { buildAhead } from "./ahead";
import { aheadServiceDay } from "./learnedPassages";
import { passageTarget } from "./records";
import { type ScheduleSnapshot, loadSchedule } from "./schedule";
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

const NAMES = { a: "Rua A", b: "Rua B", c: "Rua C", d: "Rua D", e: "Rua E" };
// 1 A* (08:10) · 2 B, 3 C interpoladas · 4 D* (08:44) · 5 E* (08:50). Só os pontos de controle têm horário oficial.
const LINES: LineSpec[] = [
  {
    code: "1",
    color: "#7CB342",
    stops: [{ stop: "a", timepoint: true }, { stop: "b" }, { stop: "c" }, { stop: "d", timepoint: true }, { stop: "e", timepoint: true }],
    trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 4: 524, 5: 530 } }],
  },
];
const seed = lineSeed(NAMES, LINES);
const tId = seed.trips.find((t) => t.key.endsWith("/L1/0810"))!.id;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

describe("buildAhead: ordem não decrescente (ideia 197)", () => {
  it("a interpolada aprendida passa do ponto de controle seguinte: o horário seguinte não desce", async () => {
    const snapshot = await load(seed);
    const instant = lisbon("2026-09-02", "08:00");
    const day = aheadServiceDay(snapshot, tId, instant)!;
    const target = passageTarget(snapshot, tId, 3, day.date, day.dayType)!;
    // Atraso aprendido de +30 min na paragem 3 (interpolada, ~08:34 → ~09:04), depois do ponto 4 oficial (08:44).
    const records: PassageRecord[] = [1, 2, 3, 4].map((d) => ({
      deviation: 30,
      observedAt: instant - d * 86_400_000,
      serviceDate: day.date,
      dayType: target.dayType,
      tripId: target.tripId,
      patternId: target.patternId,
      position: target.position,
      stopId: target.stopId,
      matchStatus: "auto" as const,
      mode: "live" as const,
      kind: "boarded" as const,
    }));

    const a = buildAhead(tId, 1, snapshot, { learning: { records, now: instant } })!;
    const rows = [a.here, ...a.stops];
    const c = a.stops.find((s) => s.position === 3)!;
    const d = a.stops.find((s) => s.position === 4)!;
    // O caso é real: sem o máximo corrido, o 4 (08:44) ficaria abaixo do 3.
    expect(toMin(c.time)).toBeGreaterThan(524);
    // C1 e C2
    rows.slice(1).forEach((r, i) => {
      const prev = rows[i]!;
      expect(toMin(r.time)).toBeGreaterThanOrEqual(toMin(prev.time));
      expect(toMin(r.rangeEnd)).toBeGreaterThanOrEqual(toMin(prev.rangeEnd));
    });
    expect(d.time).toBe(c.time);
    // C3: a frase usa os horários corrigidos
    for (const ntp of a.nextTimepoints) {
      expect(a.stops.find((s) => s.isTimepoint && s.name === ntp.name)!.time).toBe(ntp.time);
    }
    expect(a.nextTimepoints[0]).toEqual({ name: "Rua D", time: d.time });
  });

  it("sem aprendizado nada muda: a lista oficial já é crescente", async () => {
    const snapshot = await load(seed);
    const a = buildAhead(tId, 1, snapshot)!;
    expect([a.here, ...a.stops].map((r) => r.time)).toEqual(["08:10", "08:21", "08:33", "08:44", "08:50"]);
  });
});
