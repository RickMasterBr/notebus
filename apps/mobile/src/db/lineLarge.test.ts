/// <reference types="node" />
/**
 * Linha grande atravessando os blocos (E-08 bloco 10, item 3, T-128): 300 viagens por frequência passam dos blocos de 50
 * (`insertChunked`) e de 100 (`CHUNK` em lineDelete, `IN_CHUNK` em lineUsage). Contagens exatas.
 */
import { createHash } from "node:crypto";
import { officialId, serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { prepareImport } from "../data/backupFlow";
import { MAX_FREQUENCY_TRIPS } from "../data/frequency";
import { importBackup, readBackupInput } from "./backup";
import { type ImportDb, importMobilis } from "./importMobilis";
import { createLine } from "./lineCreate";
import { deleteLine } from "./lineDelete";
import { isLineUnused, lineUsage } from "./lineUsage";
import type { BackupStore } from "./migrate";
import { option, pattern, patternStop, tables } from "./schema";
import { createStop } from "./stopCreate";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { lineSeed } from "./testing/lineSeed";

const NOW = 1_800_000_000_000;
const stopId = (short: string) => officialId(`mobilis/stop/${short}`);

/** Rede inventada (D-091) com os três tipos de dia, que o `exampleNetworkSeed` não tem. */
const seed = () =>
  lineSeed({ S: "Estação Inventada", A: "Arrabalde Inventado", K: "Campus Exemplo" }, [
    {
      code: "1",
      color: "#7CB342",
      stops: [{ stop: "S", timepoint: true }, { stop: "A" }, { stop: "K", timepoint: true }],
      trips: [{ id: "0810", days: ["weekday", "saturday", "sunday_holiday"], times: { 1: 490, 3: 520 } }],
    },
  ]);
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const noCopies: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

const OWN_TABLES = ["line", "pattern", "patternStop", "timetable", "trip", "tripDayType", "stopTime", "frequency", "frequencyDayType"] as const;
type OwnTable = (typeof OWN_TABLES)[number];

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, seed());
  return { db, raw };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** 06:00 a cada 3 min, 300 saídas: a última é 20:57 (06:00 + 299 × 3). */
const bigDraft = (over: Partial<LineDraft> = {}): LineDraft => ({
  code: "99",
  name: "Linha Grande",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds: [stopId("S"), stopId("A"), stopId("K")] },
  durationMinutes: 20,
  dayTypeCodes: ["weekday", "saturday", "sunday_holiday"],
  frequency: { fromMinute: 360, toMinute: 1257, headwayMinutes: 3 },
  ...over,
});

/** Linhas dos usuários (source user) por tabela, vivas e total. */
async function userRows(db: Setup["db"]) {
  const out = {} as Record<OwnTable, { live: number; all: number }>;
  for (const name of OWN_TABLES) {
    const rows = (await db.select().from(tables[name])).filter((r) => r.source === "user");
    out[name] = { live: rows.filter((r) => r.deletedAt === null).length, all: rows.length };
  }
  return out;
}

const EXPECTED = { line: 1, pattern: 1, patternStop: 3, timetable: 1, trip: 300, tripDayType: 900, stopTime: 600, frequency: 1, frequencyDayType: 3 };
const ZERO = Object.fromEntries(OWN_TABLES.map((n) => [n, 0])) as Record<OwnTable, number>;
const liveOf = (rows: Awaited<ReturnType<typeof userRows>>) => Object.fromEntries(OWN_TABLES.map((n) => [n, rows[n].live])) as Record<OwnTable, number>;
const allOf = (rows: Awaited<ReturnType<typeof userRows>>) => Object.fromEntries(OWN_TABLES.map((n) => [n, rows[n].all])) as Record<OwnTable, number>;

describe("linha grande: 300 viagens por frequência nos três tipos de dia", () => {
  it("o teto de uma frequência é 300", () => {
    expect(MAX_FREQUENCY_TRIPS).toBe(300);
  });

  it("criar: 300 viagens, 900 vínculos de dia, 600 horários, e a última saída é 20:57", async () => {
    const { db } = await setup();
    const res = await createLine(db, bigDraft(), NOW);
    if (!res.ok) throw new Error(res.reason);
    expect(res.tripCount).toBe(300);
    expect(liveOf(await userRows(db))).toEqual(EXPECTED);

    const first = (await db.select().from(patternStop)).find((p) => p.patternId === res.patternId && p.position === 1)!;
    const minutes = (await db.select().from(tables.stopTime)).filter((s) => s.patternStopId === first.id).map((s) => s.serviceMinute);
    expect(minutes).toHaveLength(300);
    expect(Math.min(...minutes)).toBe(360);
    expect(Math.max(...minutes)).toBe(1257);
  });

  it("apagar: nada fica vivo, tudo com o mesmo deletedAt; Desfazer devolve tudo com o updatedAt de antes", async () => {
    const { db } = await setup();
    const res = await createLine(db, bigDraft(), NOW);
    if (!res.ok) throw new Error(res.reason);

    const deleted = await deleteLine(db, res.lineId, NOW + 100);
    if (!deleted.ok) throw new Error(deleted.reason);
    const afterDelete = await userRows(db);
    expect(liveOf(afterDelete)).toEqual(ZERO);
    expect(allOf(afterDelete)).toEqual(EXPECTED);
    const stamps = new Set<number | null>();
    for (const name of OWN_TABLES) {
      for (const r of await db.select().from(tables[name])) if (r.source === "user") stamps.add(r.deletedAt);
    }
    expect([...stamps]).toEqual([NOW + 100]);

    expect(await deleted.undo(NOW + 200)).toEqual({ ok: true });
    const afterUndo = await userRows(db);
    expect(liveOf(afterUndo)).toEqual(EXPECTED);
    expect(allOf(afterUndo)).toEqual(EXPECTED);
    for (const name of OWN_TABLES) {
      for (const r of await db.select().from(tables[name])) if (r.source === "user") expect(r.updatedAt).toBe(NOW);
    }
  });

  it("Desfazer da criação apaga tudo, em blocos de 50", async () => {
    const { db } = await setup();
    const res = await createLine(db, bigDraft(), NOW);
    if (!res.ok) throw new Error(res.reason);
    expect(await res.undo(NOW + 50)).toEqual({ ok: true });
    const after = await userRows(db);
    expect(liveOf(after)).toEqual(ZERO);
    expect(allOf(after)).toEqual(EXPECTED);
  });

  it("backup: exportar e importar num banco novo devolve as mesmas contagens", async () => {
    const src = await setup();
    const res = await createLine(src.db, bigDraft(), NOW);
    if (!res.ok) throw new Error(res.reason);

    const exportText = await serializeBackup(await readBackupInput(src.raw, { now: NOW, appVersion: "1.0.0" }), sha256);
    const dst = await setup();
    const preview = await prepareImport(dst.raw, exportText, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await importBackup(dst.raw, preview.file, { backups: noCopies, now: NOW + 60_000 });

    expect(liveOf(await userRows(dst.db))).toEqual(EXPECTED);
    expect(await userRows(dst.db)).toEqual(await userRows(src.db));
  });
});

describe("padrão com 120 paradas: lineUsage enxerga a opção no segundo bloco de 100", () => {
  async function bigPattern() {
    const { db } = await setup();
    const stopIds: string[] = [];
    for (let i = 1; i <= 120; i++) {
      const stop = await createStop(db, { name: `Parada ${i}`, aliases: [], externalId: null, note: null }, NOW + i);
      if (!stop.ok) throw new Error(stop.reason);
      stopIds.push(stop.id);
    }
    const res = await createLine(
      db,
      bigDraft({
        pattern: { label: "longa", stopIds },
        durationMinutes: 240,
        dayTypeCodes: ["weekday"],
        frequency: undefined,
        departures: [{ hour: 7, minute: 0 }],
      }),
      NOW + 1000,
    );
    if (!res.ok) throw new Error(res.reason);
    const stops = await db.select().from(patternStop).where(eq(patternStop.patternId, res.patternId));
    expect(stops).toHaveLength(120);
    const at = (position: number) => stops.find((s) => s.position === position)!.id;
    const addOption = (board: string | null, alight: string | null) =>
      db.insert(option).values({
        id: "opt-1",
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        source: "user",
        routeId: "route-x",
        kind: "bus",
        boardPatternStopId: board,
        alightPatternStopId: alight,
        sort: 0,
      });
    return { db, res, at, addOption };
  }

  it("sem uso: 0 registros e 0 opções", async () => {
    const { db, res } = await bigPattern();
    expect(await lineUsage(db, res.lineId)).toEqual({ observations: 0, options: 0 });
  });

  it("opção que embarca na 110ª parada: options 1, e apagar a linha recusa com in_use", async () => {
    const { db, res, at, addOption } = await bigPattern();
    await addOption(at(110), null);
    expect(await lineUsage(db, res.lineId)).toEqual({ observations: 0, options: 1 });
    expect(await deleteLine(db, res.lineId, NOW + 2000)).toEqual({ ok: false, reason: "in_use", usage: { observations: 0, options: 1 } });
    expect(isLineUnused(await lineUsage(db, res.lineId))).toBe(false);
  });

  it("opção que desce na 120ª parada também conta, e o Desfazer da criação responde stale", async () => {
    const { db, res, at, addOption } = await bigPattern();
    await addOption(null, at(120));
    expect(await lineUsage(db, res.lineId)).toEqual({ observations: 0, options: 1 });
    expect(await res.undo(NOW + 3000)).toEqual({ ok: false, reason: "stale" });
  });

  it("apagar a linha sem uso apaga as 120 paradas do percurso (2 blocos)", async () => {
    const { db, res } = await bigPattern();
    expect((await deleteLine(db, res.lineId, NOW + 2000)).ok).toBe(true);
    const live = (await db.select().from(patternStop)).filter((p) => p.patternId === res.patternId && p.deletedAt === null);
    expect(live).toHaveLength(0);
  });
});

describe("linha com 101 percursos: lineUsage avança o primeiro bloco de 100", () => {
  it("opção que embarca numa parada do 101º percurso conta", async () => {
    const { db } = await setup();
    const res = await createLine(db, bigDraft({ frequency: undefined, departures: [{ hour: 7, minute: 0 }] }), NOW);
    if (!res.ok) throw new Error(res.reason);
    const base = { createdAt: 1, updatedAt: 1, deletedAt: null, source: "user" as const };
    const extra = Array.from({ length: 100 }, (_, i) => ({ ...base, id: `pat-${String(i).padStart(3, "0")}`, lineId: res.lineId, label: `extra ${i}`, isCircular: false }));
    await db.insert(pattern).values(extra);
    await db.insert(patternStop).values(
      extra.map((p, i) => ({ ...base, id: `ps-${String(i).padStart(3, "0")}`, patternId: p.id, position: 1, stopId: stopId("S"), isTimepoint: false, timepointLabel: null })),
    );
    expect(await lineUsage(db, res.lineId)).toEqual({ observations: 0, options: 0 });

    // Os 101 percursos vivos da linha: o primeiro bloco de 100 não inclui o último.
    const patterns = (await db.select().from(pattern)).filter((p) => p.lineId === res.lineId);
    expect(patterns).toHaveLength(101);
    const last = patterns[100]!;
    const lastStop = (await db.select().from(patternStop)).find((s) => s.patternId === last.id)!;
    await db.insert(option).values({ ...base, id: "opt-last", routeId: "route-x", kind: "bus", boardPatternStopId: lastStop.id, alightPatternStopId: null, walkMinutes: null, sort: 0 });
    expect(await lineUsage(db, res.lineId)).toEqual({ observations: 0, options: 1 });
  });
});
