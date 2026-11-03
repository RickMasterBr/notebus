/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { type Migration, migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { tables, tripDate } from "./schema";
import { fixtures } from "./testing/fixtures";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";

// A migração 0004 (formato 2 do seed) só cria `trip_date` e os dois índices únicos.

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-tripdate-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  const backups = nodeBackupStore(conn, join(dir, "backups"));
  let t = Date.UTC(2026, 10, 3, 8, 0);
  const migrate = (list: readonly Migration[]) => migrateProtected({ db: conn, backups, migrations: list, now: () => (t += 60_000) });
  return { conn, backups, migrate };
}

describe("migração 0004, trip_date", () => {
  it("é a quinta migração e só cria trip_date e seus índices únicos", () => {
    expect(migrations).toHaveLength(5);
    const statements = migrations[4]!.sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    expect(statements.filter((s) => s.startsWith("CREATE TABLE"))).toHaveLength(1);
    expect(statements[0]).toMatch(/^CREATE TABLE `trip_date`/);
    expect(statements.filter((s) => s.startsWith("CREATE UNIQUE INDEX"))).toHaveLength(2);
    expect(statements.every((s) => s.startsWith("CREATE TABLE `trip_date`") || s.startsWith("CREATE UNIQUE INDEX"))).toBe(true);
    expect(migrations[4]!.sql).not.toMatch(/ALTER|DROP/);
  });

  it("v4 → v5: as linhas continuam, trip_date nasce vazia e a cópia foi feita", async () => {
    const { conn, backups, migrate } = setup();
    expect(await migrate(migrations.slice(0, 4))).toMatchObject({ status: "migrated", to: 4 });
    for (const sql of fixtures[4]!) conn.db.exec(sql);
    const before = {
      trip: conn.all("SELECT * FROM trip"),
      stop: conn.all("SELECT * FROM stop ORDER BY id"),
      holiday: conn.all("SELECT * FROM holiday ORDER BY id"),
    };

    const result = await migrate(migrations);

    expect(result).toMatchObject({ status: "migrated", from: 4, to: 5 });
    expect(await conn.userVersion()).toBe(5);
    expect(await backups.list()).toContain((result as { backupName: string }).backupName);
    expect(conn.all("SELECT * FROM trip_date")).toEqual([]);
    expect(conn.all("SELECT * FROM trip")).toEqual(before.trip);
    expect(conn.all("SELECT * FROM stop ORDER BY id")).toEqual(before.stop);
    expect(conn.all("SELECT * FROM holiday ORDER BY id")).toEqual(before.holiday);
  });

  it("trip_date está em `tables` e as colunas do banco são as do schema.ts", async () => {
    const { conn, migrate } = setup();
    await migrate(migrations);
    expect(Object.values(tables)).toContain(tripDate);
    const { columns } = getTableConfig(tripDate);
    const inDb = conn.all("PRAGMA table_info(`trip_date`)").map((c) => c.name);
    expect(inDb.sort()).toEqual(columns.map((c) => c.name).sort());
    expect(inDb).toHaveLength(9);
  });

  it("a chave oficial e o par viagem + data são únicos", async () => {
    const { conn, migrate } = setup();
    await migrate(migrations);
    const insert = (id: string, key: string, kind = "not_on") =>
      conn.db.exec(
        `INSERT INTO trip_date (id, created_at, updated_at, source, official_key, trip_id, date, kind) VALUES ('${id}', 1, 1, 'official', '${key}', 't', '2026-12-25', '${kind}')`,
      );
    insert("a", "k1");
    expect(() => insert("b", "k1")).toThrow();
    expect(() => insert("c", "k2", "also_on")).toThrow();
  });
});
