import { describe, expect, it } from "vitest";
import { busCandidates, gotoCards, type BusOption } from "@notebus/domain";
import { buildGotoInput } from "./gotoData";
import { loadSchedule } from "./schedule";
import { createPlaces } from "../db/places";
import { testDbWithSqlite } from "../db/testing/drizzleTestDb";
import { importMobilis } from "../db/importMobilis";
import { exampleSeed } from "../db/testing/exampleSeed";
import { observation, patternStop, ride } from "../db/schema";

// Quarta-feira 07/10/2026, 07:00 (dia útil)
const WED_NOW = Date.UTC(2026, 9, 7, 6, 0, 0); // 07:00 em Lisboa (UTC+1)

async function setupGotoFixture() {
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
  const placesRepo = createPlaces(db);
  return { db, schedule, placesRepo };
}

describe("Item 2: Adaptador banco → domínio (gotoData)", () => {
  it("uma opção cadastrada pelo item 1 produz o mesmo leaveAt e arriveAt que a chamada direta a busCandidates", async () => {
    const { db, schedule, placesRepo } = await setupGotoFixture();

    const casa = await placesRepo.createPlace({ name: "Casa" }, WED_NOW);
    const facul = await placesRepo.createPlace({ name: "Facul" }, WED_NOW);
    const rota = await placesRepo.ensureRoute(casa.id, facul.id, WED_NOW);

    // Paragens pos 1 e pos 2
    const ps = await db.select().from(patternStop);
    const ps1 = ps.find((p) => p.position === 1)!;
    const ps2 = ps.find((p) => p.position === 2)!;

    // Tempos a pé: 8 min até o embarque, 5 min depois da descida
    await placesRepo.setWalkTime(ps1.stopId, casa.id, { minutesMin: 8, minutesMax: null }, WED_NOW);
    await placesRepo.setWalkTime(ps2.stopId, facul.id, { minutesMin: 5, minutesMax: null }, WED_NOW);

    const opt = await placesRepo.addOption(
      {
        kind: "bus",
        routeId: rota.id,
        boardPatternStopId: ps1.id,
        alightPatternStopId: ps2.id,
      },
      WED_NOW,
    );

    // Constrói a entrada pelo adaptador
    const gotoInput = await buildGotoInput(rota.id, WED_NOW, schedule, db);
    expect(gotoInput).not.toBeNull();
    expect(gotoInput!.busOptions).toHaveLength(1);

    const adaptedOption = gotoInput!.busOptions[0]!;
    expect(adaptedOption.walkToBoard).toEqual({ min: 8, max: null });
    expect(adaptedOption.walkAfterAlight).toEqual({ min: 5, max: null });

    // Candidatos pela entrada adaptada
    const adaptedCandidates = busCandidates(adaptedOption, gotoInput!);
    expect(adaptedCandidates.length).toBeGreaterThan(0);

    // Chamada direta com os mesmos números manuais
    const pattern = schedule.patterns.find((p) => p.id === ps1.patternId)!;
    const directOption: BusOption = {
      id: opt.id,
      pattern,
      boardPosition: 1,
      alightPosition: 2,
      walkToBoard: { min: 8, max: null },
      walkAfterAlight: { min: 5, max: null },
      rideMinutes: [],
    };
    const directCandidates = busCandidates(directOption, gotoInput!);

    // Prova que o adaptador não distorce
    expect(adaptedCandidates.map((c) => ({ leave: c.leaveAt, arrive: c.arriveAt, until: c.until })))
      .toEqual(directCandidates.map((c) => ({ leave: c.leaveAt, arrive: c.arriveAt, until: c.until })));
  });

  it("par sem walk_time adota { min: 0, max: null }", async () => {
    const { db, schedule, placesRepo } = await setupGotoFixture();
    const casa = await placesRepo.createPlace({ name: "Casa" }, WED_NOW);
    const facul = await placesRepo.createPlace({ name: "Facul" }, WED_NOW);
    const rota = await placesRepo.ensureRoute(casa.id, facul.id, WED_NOW);

    const ps = await db.select().from(patternStop);
    const ps1 = ps.find((p) => p.position === 1)!;
    const ps2 = ps.find((p) => p.position === 2)!;

    // Sem setWalkTime
    await placesRepo.addOption(
      {
        kind: "bus",
        routeId: rota.id,
        boardPatternStopId: ps1.id,
        alightPatternStopId: ps2.id,
      },
      WED_NOW,
    );

    const gotoInput = await buildGotoInput(rota.id, WED_NOW, schedule, db);
    expect(gotoInput!.busOptions[0]!.walkToBoard).toEqual({ min: 0, max: null });
    expect(gotoInput!.busOptions[0]!.walkAfterAlight).toEqual({ min: 0, max: null });
  });

  it("opção a pé é mapeada para WalkOption e entra em gotoCards", async () => {
    const { db, schedule, placesRepo } = await setupGotoFixture();
    const casa = await placesRepo.createPlace({ name: "Casa" }, WED_NOW);
    const facul = await placesRepo.createPlace({ name: "Facul" }, WED_NOW);
    const rota = await placesRepo.ensureRoute(casa.id, facul.id, WED_NOW);

    await placesRepo.addOption({ kind: "walk", routeId: rota.id, walkMinutes: 30 }, WED_NOW);

    const gotoInput = await buildGotoInput(rota.id, WED_NOW, schedule, db);
    expect(gotoInput!.walk).toEqual({ id: expect.any(String), walkMinutes: 30 });

    const cards = gotoCards(gotoInput!);
    expect(cards.some((c) => c.kind === "walk")).toBe(true);
  });

  it("rideMinutes coleta deslocamentos de rides fechados com observações auto/manual entre as mesmas paragens", async () => {
    const { db, schedule, placesRepo } = await setupGotoFixture();
    const casa = await placesRepo.createPlace({ name: "Casa" }, WED_NOW);
    const facul = await placesRepo.createPlace({ name: "Facul" }, WED_NOW);
    const rota = await placesRepo.ensureRoute(casa.id, facul.id, WED_NOW);

    const ps = await db.select().from(patternStop);
    const ps1 = ps.find((p) => p.position === 1)!;
    const ps2 = ps.find((p) => p.position === 2)!;

    await placesRepo.addOption(
      { kind: "bus", routeId: rota.id, boardPatternStopId: ps1.id, alightPatternStopId: ps2.id },
      WED_NOW,
    );

    // Insere observação de embarque e descida, e ride fechado correspondente (duração: 15 min)
    const bObsId = "obs-b-1";
    const aObsId = "obs-a-1";
    const rideId = "ride-1";

    await db.insert(observation).values([
      {
        id: bObsId,
        createdAt: WED_NOW,
        updatedAt: WED_NOW,
        source: "user",
        stopId: ps1.stopId,
        lineId: "line-1",
        observedAt: WED_NOW,
        kind: "boarded",
        mode: "live",
        recordedAt: WED_NOW,
        patternStopId: ps1.id,
        tripId: "trip-1",
        matchStatus: "auto",
        serviceDate: "2026-10-07",
        serviceMinute: 420,
        deviationMin: 0,
      },
      {
        id: aObsId,
        createdAt: WED_NOW,
        updatedAt: WED_NOW,
        source: "user",
        stopId: ps2.stopId,
        lineId: "line-1",
        observedAt: WED_NOW + 15 * 60_000, // 15 minutos depois
        kind: "alighted",
        mode: "live",
        recordedAt: WED_NOW + 15 * 60_000,
        patternStopId: ps2.id,
        tripId: "trip-1",
        matchStatus: "manual",
        serviceDate: "2026-10-07",
        serviceMinute: 435,
        deviationMin: 0,
      },
    ]);

    await db.insert(ride).values({
      id: rideId,
      createdAt: WED_NOW,
      updatedAt: WED_NOW,
      source: "user",
      boardingObservationId: bObsId,
      alightingObservationId: aObsId,
      status: "closed",
    });

    const gotoInput = await buildGotoInput(rota.id, WED_NOW, schedule, db);
    expect(gotoInput!.busOptions[0]!.rideMinutes).toEqual([15]);
  });
});
