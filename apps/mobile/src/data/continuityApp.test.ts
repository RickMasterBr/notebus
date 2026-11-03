import { describe, expect, it } from "vitest";
import { busCandidates } from "@notebus/domain";
import { buildGotoInput } from "./gotoData";
import { loadSchedule } from "./schedule";
import { passageRecords, passageTarget } from "./records";
import { alarmPlanInput } from "../notifications/planInput";
import { createPlaces } from "../db/places";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { importMobilis } from "../db/importMobilis";
import { exampleSeed } from "../db/testing/exampleSeed";
import { observation, pattern, patternStop, ride } from "../db/schema";

// Lisboa em novembro é UTC+0. Segunda 09/11 é o último dia da vigência antiga; terça 10/11, o primeiro da nova.
const MON = Date.UTC(2026, 10, 9, 7, 0, 0);
const TUE = Date.UTC(2026, 10, 10, 7, 0, 0);
const OLD_KEY = "mobilis/2026-09-01/pattern/L1";

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const importDb = {
    exec: async (s: string) => { sqlite.exec(s); },
    run: async (s: string, p: (string | number | null)[] = []) => ({ changes: Number(sqlite.prepare(s).run(...(p as never[])).changes) }),
    all: async (s: string, p: (string | number | null)[] = []) => sqlite.prepare(s).all(...(p as never[])) as Record<string, unknown>[],
    userVersion: async () => 1,
  };
  await importMobilis(importDb, exampleSeed("2026-09-01"), { now: () => MON });
  await importMobilis(importDb, exampleSeed("2026-11-10"), { now: () => MON });
  const schedule = await loadSchedule(db);
  const repo = createPlaces(db);
  const casa = await repo.createPlace({ name: "Casa" }, MON);
  const facul = await repo.createPlace({ name: "Facul" }, MON);
  const rota = await repo.ensureRoute(casa.id, facul.id, MON);

  const oldPattern = (await db.select().from(pattern)).find((p) => p.officialKey === OLD_KEY)!;
  const stopsOf = async (patternId: string) => (await db.select().from(patternStop)).filter((p) => p.patternId === patternId);
  const oldStops = await stopsOf(oldPattern.id);
  const newPattern = (await db.select().from(pattern)).find((p) => p.id !== oldPattern.id)!;
  const newStops = await stopsOf(newPattern.id);
  const at = (rows: typeof oldStops, position: number) => rows.find((r) => r.position === position)!;

  // A opção é guardada no percurso antigo, posições 1 e 2.
  const opt = await repo.addOption(
    { kind: "bus", routeId: rota.id, boardPatternStopId: at(oldStops, 1).id, alightPatternStopId: at(oldStops, 2).id },
    MON,
  );
  return { db, schedule, rota, opt, oldPattern, newPattern, oldStops, newStops, at };
}

describe("continuidade entre vigências no app", () => {
  it("loadSchedule põe a mesma família nos dois percursos e dois quadros distintos", async () => {
    const { schedule, oldPattern, newPattern } = await setup();
    const families = schedule.patterns.map((p) => p.family);
    expect(families).toEqual(["mobilis/pattern/L1", "mobilis/pattern/L1"]);
    expect(schedule.patternQuadros!.get(oldPattern.id)).toEqual([{ validFrom: "2026-09-01", validTo: "2026-11-09" }]);
    expect(schedule.patternQuadros!.get(newPattern.id)).toEqual([{ validFrom: "2026-11-10", validTo: null }]);
  });

  it("Ir para: segunda usa o percurso antigo e terça o novo, e os dois dias têm candidato", async () => {
    const { db, schedule, rota, oldPattern, newPattern } = await setup();
    const mon = (await buildGotoInput(rota.id, MON, schedule, db))!;
    expect(mon.busOptions[0]!.pattern.id).toBe(oldPattern.id);
    expect(busCandidates(mon.busOptions[0]!, mon).length).toBeGreaterThan(0);

    const tue = (await buildGotoInput(rota.id, TUE, schedule, db))!;
    expect(tue.busOptions[0]!.pattern.id).toBe(newPattern.id);
    expect([tue.busOptions[0]!.boardPosition, tue.busOptions[0]!.alightPosition]).toEqual([1, 2]);
    expect(busCandidates(tue.busOptions[0]!, tue).length).toBeGreaterThan(0);
  });

  it("rideMinutes soma o deslocamento feito no percurso antigo e o feito no novo, nos dois dias", async () => {
    const { db, schedule, rota, oldStops, newStops, at } = await setup();
    const obs = (id: string, ps: { id: string; stopId: string }, observedAt: number, kind: "boarded" | "alighted") => ({
      id, createdAt: MON, updatedAt: MON, source: "user" as const, stopId: ps.stopId, lineId: "line-1", observedAt, kind,
      mode: "live" as const, recordedAt: observedAt, patternStopId: ps.id, tripId: "trip-1", matchStatus: "auto" as const,
      serviceDate: "2026-11-02", serviceMinute: 420, deviationMin: 0,
    });
    const pair = async (tag: string, rows: typeof oldStops, minutes: number) => {
      await db.insert(observation).values([obs(`b-${tag}`, at(rows, 1), MON, "boarded"), obs(`a-${tag}`, at(rows, 2), MON + minutes * 60_000, "alighted")]);
      await db.insert(ride).values({ id: `r-${tag}`, createdAt: MON, updatedAt: MON, source: "user", boardingObservationId: `b-${tag}`, alightingObservationId: `a-${tag}`, status: "closed" });
    };
    await pair("old", oldStops, 12);
    await pair("new", newStops, 10);
    for (const now of [MON, TUE]) {
      const input = (await buildGotoInput(rota.id, now, schedule, db))!;
      expect([...input.busOptions[0]!.rideMinutes].sort((a, b) => a - b)).toEqual([10, 12]);
    }
  });

  it("registro do percurso antigo leva patternFamily e a viagem do novo leva family no alvo", async () => {
    const { db, schedule, oldStops, at } = await setup();
    await db.insert(observation).values({
      id: "o1", createdAt: MON, updatedAt: MON, source: "user", stopId: at(oldStops, 1).stopId, lineId: "line-1", observedAt: MON,
      kind: "boarded", mode: "live", recordedAt: MON, patternStopId: at(oldStops, 1).id, tripId: "trip-1", matchStatus: "auto",
      serviceDate: "2026-11-02", serviceMinute: 420, deviationMin: 1,
    });
    const rows = await db.select().from(observation);
    expect(passageRecords(rows, schedule)[0]!.patternFamily).toBe("mobilis/pattern/L1");
    const newTrip = schedule.trips.find((t) => t.patternId !== at(oldStops, 1).patternId)!;
    expect(passageTarget(schedule, newTrip.id, 1, "2026-11-10")?.family).toBe("mobilis/pattern/L1");
  });

  it("aviso planejado na segunda acha viagem do dia do corte na posição de embarque da opção", async () => {
    const { db, schedule, opt, oldPattern } = await setup();
    const ctx = await alarmPlanInput(db, schedule, MON);
    expect(ctx.options.map((o) => o.id)).toEqual([opt.id]);
    const trips = ctx.dayData("2026-11-10").trips;
    expect(trips.length).toBeGreaterThan(0);
    for (const t of trips) {
      expect(t.patternId).toBe(oldPattern.id);
      expect(t.stopTimes.some((s) => s.position === 1)).toBe(true);
    }
  });
});
