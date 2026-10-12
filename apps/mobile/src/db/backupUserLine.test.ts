/// <reference types="node" />
/**
 * Backup da linha criada por você (E-08 §5.3, bloco 9, Item 5): ida e volta com banco vazio + MOBILIS.
 * A linha com frequência volta com percurso, paragens, viagens, horários e frequência; a linha apagada não volta.
 */
import { createHash } from "node:crypto";
import { baseTimeAt, serializeBackup, type TripData } from "@notebus/domain";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { prepareImport } from "../data/backupFlow";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { importBackup, readBackupInput } from "./backup";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { deleteLine } from "./lineDelete";
import type { BackupStore } from "./migrate";
import { listLines } from "./networkList";
import { line, pattern, patternStop, stopTime, tables, trip } from "./schema";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, exampleNetworkSeed());
  return { db, raw };
}
type Db = Awaited<ReturnType<typeof setup>>["db"];

async function roundTrip(src: Awaited<ReturnType<typeof setup>>) {
  const exportText = await serializeBackup(await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }), sha256);
  const dst = await setup();
  const preview = await prepareImport(dst.raw, exportText, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });
  return dst;
}

const draft = (over: Partial<LineDraft> = {}): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [stopId("S"), stopId("A"), stopId("K")] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  frequency: { fromMinute: 400, toMinute: 1180, headwayMinutes: 30 },
  ...over,
});

const LINE_TABLES = ["pattern", "patternStop", "timetable", "trip", "tripDayType", "stopTime", "frequency", "frequencyDayType"] as const;

/** Linhas vivas de cada tabela que pertencem à linha `lineId` (pelo percurso). */
async function liveCountsOfLine(db: Db, lineId: string) {
  const patterns = (await db.select().from(pattern).where(eq(pattern.lineId, lineId))).filter((p) => p.deletedAt === null);
  const patternIds = patterns.map((p) => p.id);
  const out = { line: (await db.select().from(line).where(eq(line.id, lineId))).filter((l) => l.deletedAt === null).length } as Record<
    "line" | (typeof LINE_TABLES)[number],
    number
  >;
  const timetables = await db.select().from(tables.timetable).where(inArray(tables.timetable.patternId, patternIds));
  const trips = await db.select().from(trip).where(inArray(trip.timetableId, timetables.map((t) => t.id)));
  const frequencies = await db.select().from(tables.frequency).where(inArray(tables.frequency.patternId, patternIds));
  const byOwner = {
    pattern: patterns,
    patternStop: await db.select().from(patternStop).where(inArray(patternStop.patternId, patternIds)),
    timetable: timetables,
    trip: trips,
    tripDayType: await db.select().from(tables.tripDayType).where(inArray(tables.tripDayType.tripId, trips.map((t) => t.id))),
    stopTime: await db.select().from(stopTime).where(inArray(stopTime.tripId, trips.map((t) => t.id))),
    frequency: frequencies,
    frequencyDayType: await db
      .select()
      .from(tables.frequencyDayType)
      .where(inArray(tables.frequencyDayType.frequencyId, frequencies.map((f) => f.id))),
  };
  for (const name of LINE_TABLES) out[name] = byOwner[name].filter((r) => r.deletedAt === null).length;
  return out;
}

async function tripData(db: Db, tripId: string): Promise<TripData> {
  const [row] = await db.select().from(trip).where(eq(trip.id, tripId));
  const times = await db.select().from(stopTime).where(eq(stopTime.tripId, tripId));
  const stops = await db.select().from(patternStop);
  const [tt] = await db.select().from(tables.timetable).where(eq(tables.timetable.id, row!.timetableId));
  return {
    id: tripId,
    patternId: tt!.patternId,
    firstPosition: row!.firstPosition,
    lastPosition: row!.lastPosition,
    stopTimes: times.map((t) => ({
      position: stops.find((s) => s.id === t.patternStopId)!.position,
      serviceMinute: t.serviceMinute,
      origin: t.origin,
    })),
  };
}

describe("backup da linha criada (bloco 9, item 5)", () => {
  it("a linha com frequência exporta e volta num banco novo: percurso, paragens, 27 viagens, horários e frequência", async () => {
    const src = await setup();
    const created = await createLine(src.db, draft(), NOW);
    if (!created.ok) throw new Error(created.reason);
    const srcCounts = await liveCountsOfLine(src.db, created.lineId);
    expect(srcCounts.trip).toBe(27);

    const dst = await roundTrip(src);

    expect(await liveCountsOfLine(dst.db, created.lineId)).toEqual(srcCounts);
    expect(await liveCountsOfLine(dst.db, created.lineId)).toMatchObject({
      line: 1,
      pattern: 1,
      patternStop: 3,
      trip: 27,
      stopTime: 54,
      frequency: 1,
      frequencyDayType: 1,
    });
    expect((await listLines(dst.db)).find((l) => l.id === created.lineId)).toMatchObject({ code: "99", patternCount: 1, source: "user" });

    const [freq] = await dst.db.select().from(tables.frequency);
    expect(freq).toMatchObject({ patternId: created.patternId, fromMinute: 400, toMinute: 1180, headwayMinutes: 30 });
    const dstTrips = await dst.db.select().from(trip).where(eq(trip.frequencyId, freq!.id));
    expect(dstTrips).toHaveLength(27);

    // o horário-base de uma viagem (06:40) lido pelo domínio é o mesmo nos dois bancos
    const datas = await Promise.all(dstTrips.map((t) => tripData(dst.db, t.id)));
    const sixForty = datas.find((d) => baseTimeAt(d, 1)?.minute === 400)!;
    const srcSame = await tripData(src.db, sixForty.id);
    expect(baseTimeAt(sixForty, 2)).toEqual({ position: 2, minute: 410, kind: "interpolated" });
    expect(baseTimeAt(sixForty, 3)).toEqual(baseTimeAt(srcSame, 3));
  });

  it("linha por horários avulsos volta sem frequência", async () => {
    const src = await setup();
    const created = await createLine(
      src.db,
      draft({ frequency: undefined, departures: [{ hour: 7, minute: 30 }, { hour: 1, minute: 10 }] }),
      NOW,
    );
    if (!created.ok) throw new Error(created.reason);

    const dst = await roundTrip(src);

    expect(await liveCountsOfLine(dst.db, created.lineId)).toMatchObject({ trip: 2, stopTime: 4, frequency: 0, frequencyDayType: 0 });
  });

  it("a linha apagada não volta", async () => {
    const src = await setup();
    const kept = await createLine(src.db, draft({ code: "91" }), NOW);
    const gone = await createLine(src.db, draft({ code: "92" }), NOW + 1);
    if (!kept.ok || !gone.ok) throw new Error("criação falhou");
    expect((await deleteLine(src.db, gone.lineId, NOW + 10)).ok).toBe(true);

    const dst = await roundTrip(src);

    const codes = (await listLines(dst.db)).map((l) => l.code);
    expect(codes).toContain("91");
    expect(codes).not.toContain("92");
    expect((await liveCountsOfLine(dst.db, gone.lineId)).trip).toBe(0);
  });
});
