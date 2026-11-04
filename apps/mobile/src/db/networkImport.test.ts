/// <reference types="node" />
/** Rede nova num banco em uso (ideia 249): preparar sem gravar, cópia antes, restauração na falha, Desfazer. */
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { describe, expect, it } from "vitest";
import { exampleNetworkSeed } from "../data/registroFixture";
import { readBackupInput } from "./backup";
import { type ImportDb, importMobilis } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { applyNetworkImport, prepareNetworkImport, undoNetworkImport } from "./networkImport";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;

function setup(failOn?: string) {
  const { sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => {
      if (failOn && sql.includes(failOn)) throw new Error("falha injetada");
      return { changes: Number(sqlite.prepare(sql).run(...params).changes) };
    },
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  const calls: string[] = [];
  const backups: BackupStore = {
    create: async (n) => void calls.push(`create:${n}`),
    restore: async (n) => void calls.push(`restore:${n}`),
    list: async () => [],
    remove: async () => {},
  };
  const count = (table: string) => Number((raw.all(`SELECT COUNT(*) AS n FROM \`${table}\``, []) as { n: number }[])[0]!.n);
  return { raw, backups, calls, count };
}

describe("prepareNetworkImport", () => {
  it("arquivo válido: resumo, sem gravar nada", async () => {
    const { raw, count } = setup();
    const seed = exampleNetworkSeed();
    const r = await prepareNetworkImport(raw, seed);
    expect(r).toMatchObject({ ok: true, lines: seed.lines.length, stops: seed.stops.length, trips: seed.trips.length, jaInstalada: false });
    expect(r.ok && r.vigencia).toBe(seed.timetables[0]!.validFrom);
    expect(count("timetable")).toBe(0);
    expect(count("line")).toBe(0);
  });

  it("jaInstalada só depois de importar", async () => {
    const { raw } = setup();
    await importMobilis(raw, exampleNetworkSeed());
    const r = await prepareNetworkImport(raw, exampleNetworkSeed());
    expect(r.ok && r.jaInstalada).toBe(true);
  });

  it("JSON qualquer não é rede", async () => {
    const { raw } = setup();
    expect((await prepareNetworkImport(raw, { a: 1 })).ok).toBe(false);
    expect((await prepareNetworkImport(raw, null)).ok).toBe(false);
  });

  it("um backup do NoteBus não é rede", async () => {
    const f = setup();
    await importMobilis(f.raw, exampleNetworkSeed());
    const text = await serializeBackup(
      await readBackupInput(f.raw, { now: NOW, appVersion: "1.0.0" }),
      (s) => createHash("sha256").update(s, "utf8").digest("hex"),
    );
    const r = await prepareNetworkImport(f.raw, JSON.parse(text));
    expect(r.ok).toBe(false);
  });
});

describe("applyNetworkImport / undoNetworkImport", () => {
  it("cópia antes de gravar, grava, e Desfazer restaura a cópia", async () => {
    const { raw, backups, calls, count } = setup();
    const r = await applyNetworkImport(raw, exampleNetworkSeed(), { backups, now: NOW });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^create:notebus-backup-.*-import\.db$/);
    expect(count("timetable")).toBeGreaterThan(0);
    if (r.ok) await undoNetworkImport(backups, r.copyName);
    expect(calls[1]).toBe(calls[0]!.replace("create:", "restore:"));
  });

  it("falha na gravação: restaura a cópia, devolve erro e não deixa nada", async () => {
    const { raw, backups, calls, count } = setup("INTO `trip`");
    const r = await applyNetworkImport(raw, exampleNetworkSeed(), { backups, now: NOW });
    expect(r.ok).toBe(false);
    expect(calls.map((c) => c.split(":")[0])).toEqual(["create", "restore"]);
    expect(count("timetable")).toBe(0);
  });

  it("arquivo inválido: erro, nada gravado", async () => {
    const { raw, backups, count } = setup();
    const r = await applyNetworkImport(raw, { a: 1 }, { backups, now: NOW });
    expect(r.ok).toBe(false);
    expect(count("network")).toBe(0);
  });
});
