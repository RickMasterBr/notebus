/// <reference types="node" />
/**
 * Investigação, sem correção (E-08 bloco 10, item 5): o que acontece com o aviso de saída quando a opção dele é apagada
 * e depois a linha também. O teste só DEMONSTRA o comportamento de hoje; a decisão é da coordenação (E-06).
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { createAlarms } from "./alarms";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { deleteLine } from "./lineDelete";
import { createPlaces } from "./places";
import { option, patternStop, tables } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;

const draft = (): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [stopId("S"), stopId("A"), stopId("K")] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  frequency: { fromMinute: 400, toMinute: 580, headwayMinutes: 30 },
});

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  const created = await createLine(db, draft(), NOW);
  if (!created.ok) throw new Error(created.reason);

  const board = (await db.select().from(patternStop).where(eq(patternStop.patternId, created.patternId))).find((s) => s.position === 1)!;
  await db.insert(option).values({
    id: "opt-1",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    source: "user",
    routeId: "route-x",
    kind: "bus",
    boardPatternStopId: board.id,
    alightPatternStopId: null,
    walkMinutes: null,
    sort: 0,
  });
  const anchor = (await db.select().from(tables.trip)).find((t) => t.timetableId !== undefined && t.source === "user")!;
  const alarms = createAlarms(db);
  const alarm = await alarms.createAlarm(
    { optionId: "opt-1", anchorTripId: anchor.id, anchorBaseMinute: 400, weekdays: [1, 2, 3, 4, 5], onceDate: null, validFrom: "2027-01-01", validTo: null, enabled: true },
    NOW + 1,
  );
  return { db, created, alarms, alarm, anchor, places: createPlaces(db) };
}

describe("aviso de saída quando a opção e a linha são apagadas (investigação, sem correção)", () => {
  it("enquanto a opção está viva, o aviso trava o apagar da linha (in_use)", async () => {
    const { db, created } = await setup();
    expect(await deleteLine(db, created.lineId, NOW + 10)).toMatchObject({ ok: false, reason: "in_use", usage: { options: 1 } });
  });

  it("apagar a opção NÃO apaga nem desliga o aviso: ele continua vivo, ligado, apontando para a opção apagada", async () => {
    const { db, alarms, alarm, places } = await setup();
    await places.removeOption("opt-1", NOW + 20);

    const [opt] = await db.select().from(option).where(eq(option.id, "opt-1"));
    expect(opt!.deletedAt).toBe(NOW + 20);
    const live = await alarms.listAlarms();
    expect(live.map((a) => a.id)).toEqual([alarm.id]);
    expect(live[0]).toMatchObject({ optionId: "opt-1", enabled: true, deletedAt: null });
  });

  it("depois, apagar a linha é permitido (sem uso) e o aviso continua vivo com a viagem-âncora apagada", async () => {
    const { db, created, alarms, alarm, anchor, places } = await setup();
    await places.removeOption("opt-1", NOW + 20);

    const deleted = await deleteLine(db, created.lineId, NOW + 30);
    expect(deleted.ok).toBe(true);

    const [anchorRow] = await db.select().from(tables.trip).where(eq(tables.trip.id, anchor.id));
    expect(anchorRow!.deletedAt).toBe(NOW + 30);

    const live = await alarms.listAlarms();
    expect(live.map((a) => a.id)).toEqual([alarm.id]);
    expect(live[0]).toMatchObject({ anchorTripId: anchor.id, enabled: true, deletedAt: null });
  });
});
