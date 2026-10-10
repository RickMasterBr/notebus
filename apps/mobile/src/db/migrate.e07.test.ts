/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Migration, migrateProtected } from "./migrate";
import { migrations } from "./migrations";
import { fixtures } from "./testing/fixtures";
import { NodeSqlite, nodeBackupStore } from "./testing/nodeSqlite";

// T-73: a migração 0002 (E-07) só acrescenta `stop.location_source`. Banco da versão anterior (v2, com os registros de
// exemplo inventados da fixture) → coluna nova existe, é nula em todas as linhas e nenhum registro some.

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-e07-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  const backups = nodeBackupStore(conn, join(dir, "backups"));
  let t = Date.UTC(2026, 9, 9, 8, 0);
  const migrate = (list: readonly Migration[]) => migrateProtected({ db: conn, backups, migrations: list, now: () => (t += 60_000) });
  return { conn, backups, migrate };
}

const userTables = (conn: NodeSqlite) =>
  conn
    .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name as string);

/** Os ids de cada tabela, para comparar antes e depois. */
const idsByTable = (conn: NodeSqlite) =>
  Object.fromEntries(userTables(conn).map((n) => [n, conn.all(`SELECT id FROM \`${n}\` ORDER BY id`).map((r) => r.id as string)]));

describe("T-73: migração 0002, stop.location_source", () => {
  it("é a terceira migração e só faz ALTER TABLE stop ADD location_source", () => {
    expect(migrations).toHaveLength(4);
    const statements = migrations[2]!.sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    expect(statements).toEqual(["ALTER TABLE `stop` ADD `location_source` text;"]);
  });

  it("v2 com registros → v3: coluna existe, é nula em todas as linhas, nada some e a cópia foi feita", async () => {
    const { conn, backups, migrate } = setup();
    expect(await migrate(migrations.slice(0, 2))).toMatchObject({ status: "migrated", to: 2 });
    for (const sql of fixtures[2]!) conn.db.exec(sql);
    // Pontos com lat/lon preenchidos antes da migração (coordenada oficial) também ficam com a coluna nula.
    conn.db.exec("UPDATE stop SET lat = 39.7, lon = -8.8 WHERE id = 'stop-a'");
    const before = idsByTable(conn);
    expect(conn.all("PRAGMA table_info(`stop`)").map((c) => c.name)).not.toContain("location_source");

    const result = await migrate(migrations.slice(0, 3));

    expect(result).toMatchObject({ status: "migrated", from: 2, to: 3 });
    expect(await conn.userVersion()).toBe(3);
    expect(await backups.list()).toContain((result as { backupName: string }).backupName);
    expect(conn.all("PRAGMA table_info(`stop`)").map((c) => c.name)).toContain("location_source");
    const stops = conn.all("SELECT id, lat, location_source FROM stop ORDER BY id");
    expect(stops).toEqual([
      { id: "stop-a", lat: 39.7, location_source: null },
      { id: "stop-b", lat: null, location_source: null },
    ]);
    expect(idsByTable(conn)).toEqual(before);
    expect(conn.all("SELECT COUNT(*) AS n FROM observation")).toEqual([{ n: 1 }]);
  });

  it("depois de migrar, a coluna aceita 'manual' e 'suggested' e continua nula quando não preenchida", async () => {
    const { conn, migrate } = setup();
    await migrate(migrations);
    for (const sql of fixtures[3]!) conn.db.exec(sql);
    expect(conn.all("SELECT id, location_source FROM stop WHERE id IN ('stop-c', 'stop-d') ORDER BY id")).toEqual([
      { id: "stop-c", location_source: null },
      { id: "stop-d", location_source: "suggested" },
    ]);
  });
});
