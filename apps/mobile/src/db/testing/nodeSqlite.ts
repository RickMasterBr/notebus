/** Adaptador NodeSQLite de mock para rodar testes sem precisar do ambiente Expo. */
/// <reference types="node" />
// Só teste: roda no Node, não no app.
/**
 * SÓ PARA TESTE. Adaptador mínimo entre `migrate.ts` e o SQLite que já vem no Node (`node:sqlite`),
 * para provar a cópia e a restauração fora do celular sem nenhuma biblioteca nova. O SQL das migrações
 * é exatamente o mesmo do app.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type { ImportDb } from "../importMobilis";
import type { BackupStore, MigrationDb } from "../migrate";

/**
 * Implementação local do banco de dados para rodar testes diretamente no Node,
 * satisfazendo tanto a interface de migração quanto a do importador de dados.
 */
export class NodeSqlite implements MigrationDb, ImportDb {
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
  all(sql: string, params: (string | number | null)[] = []): Record<string, unknown>[] {
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }
  async run(sql: string, params: (string | number | null)[]) {
    return { changes: Number(this.db.prepare(sql).run(...params).changes) };
  }
  /** Fecha e reabre: usado ao trocar o arquivo por baixo (restauração). */
  reopen() {
    this.db.close();
    this.db = new DatabaseSync(this.path);
  }
}

/**
 * Adaptador de BackupStore para Node. Salva as cópias do banco como arquivos
 * regulares no sistema de arquivos local (`dir`). A restauração fecha a conexão,
 * copia o backup de volta por cima e reabre.
 */
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
