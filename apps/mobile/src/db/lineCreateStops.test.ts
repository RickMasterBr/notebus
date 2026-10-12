/// <reference types="node" />
import { officialId } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import type { LineDraft } from "../data/lineDraft";
import { importMobilis, type ImportDb } from "./importMobilis";
import { createLine } from "./lineCreate";
import { tables } from "./schema";
import { lineSeed } from "./testing/lineSeed";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const S = officialId("mobilis/stop/S");
const A = officialId("mobilis/stop/A");
const NAMES = { S: "Estação Inventada", A: "Arrabalde Inventado" };

async function setup() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  await importMobilis(raw, lineSeed(NAMES, [{ code: "1", color: "#7CB342", stops: [{ stop: "S" }, { stop: "A" }], trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 2: 500 } }] }]));
  return db;
}

const draft = (stopIds: string[], isCircular?: boolean): LineDraft => ({
  code: "99",
  name: "Linha do Rick",
  color: "#1A73E8",
  pattern: { label: "sentido Campus", stopIds, isCircular },
  durationMinutes: 20,
  dayTypeCodes: ["weekday"],
  departures: [{ hour: 7, minute: 0 }],
});

describe("createLine: paragens diferentes", () => {
  it.each([
    ["[S, S]", [S, S]],
    ["[S, A, A]", [S, A, A]],
  ])("%s é recusada e nada é gravado", async (_name, ids) => {
    const db = await setup();
    const rows = async () => [(await db.select().from(tables.line)).length, (await db.select().from(tables.pattern)).length, (await db.select().from(tables.patternStop)).length];
    const before = await rows();
    expect(await createLine(db, draft(ids), NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(await rows()).toEqual(before);
  });

  it("[S, A, S] circular cria", async () => {
    const db = await setup();
    expect((await createLine(db, draft([S, A, S], true), NOW)).ok).toBe(true);
  });
});
