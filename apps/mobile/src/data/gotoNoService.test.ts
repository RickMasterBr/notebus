import { describe, expect, it } from "vitest";
import { resolveGotoNoService } from "./gotoNoService";
import { loadSchedule } from "./schedule";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { importMobilis } from "../db/importMobilis";
import { exampleSeed } from "../db/testing/exampleSeed";
import { patternStop } from "../db/schema";
import { tripsRunningOn } from "@notebus/domain";

// Quarta-feira 07/10/2026, 07:00 (dia útil)
const WED_NOW = Date.UTC(2026, 9, 7, 6, 0, 0);

async function setupFixture() {
  const { db, sqlite } = testDbWithSqlite();
  const seed = exampleSeed("2026-09-01");
  const importDb = {
    exec: async (s: string) => { sqlite.exec(s); },
    run: async (s: string, p: (string | number | null)[] = []) => {
      const res = sqlite.prepare(s).run(...(p as never[]));
      return { changes: Number(res.changes) };
    },
    all: async (s: string, p: (string | number | null)[] = []) => {
      return sqlite.prepare(s).all(...(p as never[])) as Record<string, unknown>[];
    },
    userVersion: async () => 1,
  };
  await importMobilis(importDb, seed, { now: () => WED_NOW });
  const schedule = await loadSchedule(db);
  const pst = await db.select().from(patternStop);
  return { db, schedule, pst };
}

describe("T-50: Casos de borda sem serviço na rota (gotoNoService)", () => {
  it("quando não há viagens no dia de serviço, exibe 'Nenhum serviço hoje' e o próximo dia", async () => {
    const { schedule, pst } = await setupFixture();
    const ps1 = pst.find((p) => p.position === 1)!;
    const patternId = ps1.patternId;

    // Domingo 11/10/2026: supondo lista vazia de viagens hoje para a rota
    const res = resolveGotoNoService({
      patternIds: [patternId],
      tripsToday: [], // Nenhuma viagem rodando hoje
      nowMinute: 8 * 60, // 08:00
      serviceDate: "2026-10-11", // Domingo
      schedule,
      boardPositions: new Map([[patternId, 1]]),
    });

    expect(res.reason).toBe("Nenhum serviço hoje");
    expect(res.nextServiceText).toBeDefined();
    // Próximo serviço na segunda-feira
    expect(res.nextServiceText).toMatch(/Próximo serviço: segunda às 08:10/);
  });

  it("quando havia viagens hoje mas todas já partiram, exibe 'Sem mais viagens hoje' e o próximo serviço", async () => {
    const { schedule, pst } = await setupFixture();
    const ps1 = pst.find((p) => p.position === 1)!;
    const patternId = ps1.patternId;

    // Quarta 07/10/2026 (dia útil)
    const runningWedIds = new Set(
      tripsRunningOn("2026-10-07", "weekday", schedule.schedule).map((t) => t.id),
    );
    const tripsWed = schedule.trips.filter(
      (t) => runningWedIds.has(t.id) && t.patternId === patternId,
    );
    expect(tripsWed.length).toBeGreaterThan(0);

    // Horário das 23:50 (1430 min), após todas as viagens do dia terem partido
    const res = resolveGotoNoService({
      patternIds: [patternId],
      tripsToday: tripsWed,
      nowMinute: 23 * 60 + 50, // 23:50
      serviceDate: "2026-10-07",
      schedule,
      boardPositions: new Map([[patternId, 1]]),
    });

    expect(res.reason).toBe("Sem mais viagens hoje");
    expect(res.nextServiceText).toBeDefined();
    // Próximo serviço na quinta-feira
    expect(res.nextServiceText).toMatch(/Próximo serviço: quinta às 08:10/);
  });
});
