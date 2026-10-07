/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { type Migration, MigrationFailedError, migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { tables } from "./schema";
import { fixtures } from "./testing/fixtures";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";
import { testAdditiveMigration, testBrokenMigration } from "./testing/testMigrations";

/** As 23 tabelas da E-01 §4.3–§4.6 e as 2 do aviso de saída (E-06 §3.1). */
const PLAN_TABLES = [
  "network", "dataset", "stop", "line", "pattern", "pattern_stop",
  "day_type", "holiday", "date_override", "season", "timetable", "trip", "trip_day_type", "stop_time",
  "frequency", "frequency_day_type",
  "observation", "ride",
  "place", "walk_time", "route", "option", "setting",
  "departure_alarm", "alarm_event",
];

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  const backupDir = join(dir, "backups");
  const backups = nodeBackupStore(conn, backupDir);
  let t = Date.UTC(2026, 9, 2, 8, 0);
  const migrate = (list: readonly Migration[]) =>
    migrateProtected({ db: conn, backups, migrations: list, now: () => (t += 60_000) });
  return { conn, backups, backupDir, migrate };
}

function userTables(conn: NodeSqlite): string[] {
  return conn
    .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name as string);
}

/** Tudo o que há no banco: esquema, versão e todas as linhas. */
function snapshot(conn: NodeSqlite) {
  return {
    schema: conn.all("SELECT type, name, sql FROM sqlite_master ORDER BY name"),
    version: conn.all("PRAGMA user_version"),
    rows: Object.fromEntries(userTables(conn).map((n) => [n, conn.all(`SELECT * FROM \`${n}\` ORDER BY id`)])),
  };
}

/** Confere que cada linha de `before` continua em `after`, com os mesmos valores nas colunas antigas. */
function expectNoRowLost(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>) {
  for (const [table, rows] of Object.entries(before.rows)) {
    const afterById = new Map((after.rows[table] ?? []).map((r) => [r.id, r]));
    for (const row of rows) expect(afterById.get(row.id), `${table}/${row.id}`).toMatchObject(row);
  }
}

describe("migração v1 (0000_init)", () => {
  it("vazio → v1: cria as 25 tabelas do plano, com as colunas de schema.ts", async () => {
    const { conn, migrate } = setup();
    expect(await migrate(migrations)).toMatchObject({ status: "migrated", from: 0, to: migrations.length });
    expect(await conn.userVersion()).toBe(migrations.length);
    expect(userTables(conn)).toEqual([...PLAN_TABLES].sort());

    for (const table of Object.values(tables)) {
      const { name, columns } = getTableConfig(table);
      const inDb = conn.all(`PRAGMA table_info(\`${name}\`)`).map((c) => c.name);
      expect(inDb.sort(), name).toEqual(columns.map((c) => c.name).sort());
    }
  });

  it("rodar de novo não faz nada nem faz cópia", async () => {
    const { migrate, backups } = setup();
    await migrate(migrations);
    const copies = await backups.list();
    expect(await migrate(migrations)).toEqual({ status: "up_to_date", version: migrations.length });
    expect(await backups.list()).toEqual(copies);
  });

  it("toda versão publicada tem fixture", () => {
    for (let v = 1; v <= migrations.length; v++) expect(fixtures[v], `fixture v${v}`).toBeDefined();
  });
});

describe("§6.6: cada migração contra banco vazio e contra a fixture de cada versão anterior", () => {
  // A migração aditiva de teste faz o papel da "versão 2" enquanto só existe a 1.
  const all = [...migrations, testAdditiveMigration];

  for (let from = 0; from < all.length; from++) {
    it(`v${from} → v${all.length} não perde nenhum registro`, async () => {
      const { conn, migrate } = setup();
      if (from > 0) await migrate(all.slice(0, from));
      for (const sql of fixtures[from] ?? []) conn.db.exec(sql);
      const before = snapshot(conn);

      expect(await migrate(all)).toMatchObject({ status: "migrated", from, to: all.length });
      const after = snapshot(conn);
      expectNoRowLost(before, after);
      for (const [table, rows] of Object.entries(before.rows)) expect(after.rows[table]).toHaveLength(rows.length);
    });
  }

  it("v1 com registros → v2: a coluna nova aparece com o valor padrão", async () => {
    const { conn, migrate } = setup();
    await migrate(migrations);
    for (const sql of fixtures[1]!) conn.db.exec(sql);
    await migrate([...migrations, testAdditiveMigration]);
    expect(conn.all("SELECT id, name, test_note FROM place")).toEqual([{ id: "home", name: "Casa", test_note: "nova" }]);
    expect(conn.all("SELECT id FROM stop ORDER BY id")).toEqual([{ id: "stop-a" }, { id: "stop-b" }]);
  });
});

describe("A7: migração que quebra no meio", () => {
  it("volta idêntico à cópia, devolve o erro tipado e não grava nada novo", async () => {
    const { conn, migrate, backupDir } = setup();
    await migrate(migrations);
    for (const sql of fixtures[1]!) conn.db.exec(sql);
    const before = snapshot(conn);

    const result = await migrate([...migrations, testBrokenMigration]);

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toBeInstanceOf(MigrationFailedError);
    expect(result.error).toMatchObject({
      code: "migration_failed",
      fromVersion: migrations.length,
      targetVersion: migrations.length + 1,
      restored: true,
    });

    // Banco idêntico ao de antes e à cópia, byte a byte.
    expect(snapshot(conn)).toEqual(before);
    expect(userTables(conn)).not.toContain("half_done");
    expect(readFileSync(conn.path)).toEqual(readFileSync(join(backupDir, result.error.backupName!)));

    // Segue na versão antiga, só leitura: nenhuma escrita passa.
    expect(await conn.userVersion()).toBe(migrations.length);
    expect(() =>
      conn.db.exec("INSERT INTO place (id, created_at, updated_at, source, name) VALUES ('novo', 1, 1, 'user', 'Novo')"),
    ).toThrow(/readonly|query_only/i);
  });

  it("se nem a cópia der para fazer, não migra nada", async () => {
    const { conn, backups, migrate } = setup();
    await migrate(migrations);
    backups.create = async () => {
      throw new Error("disco cheio");
    };
    const result = await migrate([...migrations, testAdditiveMigration]);
    expect(result).toMatchObject({ status: "failed", error: { backupName: null } });
    expect(await conn.userVersion()).toBe(migrations.length);
    expect(conn.all("PRAGMA table_info(place)").map((c) => c.name)).not.toContain("test_note");
  });
});

describe("cópias", () => {
  it("guarda só as 3 mais novas", async () => {
    const { migrate, backups } = setup();
    const steps: Migration[] = [1, 2, 3, 4, 5].map((i) => ({ tag: `t${i}`, sql: `CREATE TABLE t${i} (x);` }));
    const names: string[] = [];
    for (let v = 1; v <= steps.length; v++) {
      const r = await migrate(steps.slice(0, v));
      if (r.status === "migrated") names.push(r.backupName);
    }
    expect(names).toHaveLength(5);
    expect((await backups.list()).sort()).toEqual(names.slice(-3));
  });
});
