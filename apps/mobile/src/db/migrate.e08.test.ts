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

// A migração 0003 (E-08, D-114) só acrescenta `holiday.recurring`. Banco da versão anterior (v3, com o feriado
// municipal de exemplo da fixture) → a linha continua, com `recurring` = 0; e o `scope` "manual" grava e lê.

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "notebus-e08-"));
  const conn = new NodeSqlite(join(dir, "notebus.db"));
  const backups = nodeBackupStore(conn, join(dir, "backups"));
  let t = Date.UTC(2026, 9, 10, 8, 0);
  const migrate = (list: readonly Migration[]) => migrateProtected({ db: conn, backups, migrations: list, now: () => (t += 60_000) });
  return { conn, backups, migrate };
}

const columnsOf = (conn: NodeSqlite, table: string) => conn.all(`PRAGMA table_info(\`${table}\`)`).map((c) => c.name as string);

describe("E-08: migração 0003, holiday.recurring", () => {
  it("é a quarta migração e só faz ALTER TABLE holiday ADD recurring", () => {
    expect(migrations).toHaveLength(4);
    const statements = migrations[3]!.sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    expect(statements).toEqual(["ALTER TABLE `holiday` ADD `recurring` integer DEFAULT false NOT NULL;"]);
  });

  it("v3 com um feriado municipal → v4: a linha continua, com recurring = 0, e a cópia foi feita", async () => {
    const { conn, backups, migrate } = setup();
    expect(await migrate(migrations.slice(0, 3))).toMatchObject({ status: "migrated", to: 3 });
    for (const sql of fixtures[3]!) conn.db.exec(sql);
    expect(columnsOf(conn, "holiday")).not.toContain("recurring");
    expect(conn.all("SELECT id, scope, date FROM holiday")).toEqual([{ id: "hol", scope: "municipal", date: "2026-05-22" }]);

    const result = await migrate(migrations);

    expect(result).toMatchObject({ status: "migrated", from: 3, to: 4 });
    expect(await conn.userVersion()).toBe(4);
    expect(await backups.list()).toContain((result as { backupName: string }).backupName);
    expect(columnsOf(conn, "holiday")).toContain("recurring");
    expect(conn.all("SELECT id, scope, date, recurring FROM holiday")).toEqual([
      { id: "hol", scope: "municipal", date: "2026-05-22", recurring: 0 },
    ]);
  });

  it("depois de migrar, um feriado 'manual' com recurring = 1 grava e lê de volta", async () => {
    const { conn, migrate } = setup();
    await migrate(migrations);
    conn.db.exec(
      "INSERT INTO holiday (id, created_at, updated_at, source, network_id, date, name, scope, recurring) VALUES ('h-man', 1, 1, 'user', 'net', '2026-03-03', 'Dia inventado', 'manual', 1)",
    );
    expect(conn.all("SELECT scope, recurring FROM holiday WHERE id = 'h-man'")).toEqual([{ scope: "manual", recurring: 1 }]);
  });
});
