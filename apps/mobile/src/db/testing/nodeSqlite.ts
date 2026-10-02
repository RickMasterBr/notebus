/**
 * SÓ PARA TESTE. Adaptador mínimo entre `migrate.ts` e o SQLite que já vem no Node (`node:sqlite`),
 * para provar a cópia e a restauração fora do celular sem nenhuma biblioteca nova. O SQL das migrações
 * é exatamente o mesmo do app.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type { BackupStore, MigrationDb } from "../migrate";

export class NodeSqlite implements MigrationDb {
  db: DatabaseSync;
  constructor(readonly path: string) {
    this.db = new DatabaseSync(path);
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
  async userVersion() {
    return (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  }
  all(sql: string): Record<string, unknown>[] {
    return this.db.prepare(sql).all() as Record<string, unknown>[];
  }
  /** Fecha e reabre: usado ao trocar o arquivo por baixo (restauração). */
  reopen() {
    this.db.close();
    this.db = new DatabaseSync(this.path);
  }
}

/** Cópias como arquivos numa pasta. Restaurar = fechar, copiar o arquivo de volta, reabrir. */
export function nodeBackupStore(conn: NodeSqlite, dir: string): BackupStore {
  mkdirSync(dir, { recursive: true });
  return {
    create: (name) => backup(conn.db, join(dir, name)),
    async restore(name) {
      conn.db.close();
      copyFileSync(join(dir, name), conn.path);
      conn.db = new DatabaseSync(conn.path);
    },
    async list() {
      return readdirSync(dir);
    },
    async remove(name) {
      rmSync(join(dir, name));
    },
  };
}
