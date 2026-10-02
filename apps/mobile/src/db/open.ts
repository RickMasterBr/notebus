/**
 * Abre o banco no celular: migração protegida (§6) e depois o Drizzle.
 * Adaptador fino entre expo-sqlite e `migrate.ts`; a lógica é testada no Node (`migrate.test.ts`).
 */
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import { migrations } from "./migrations";
import type { ImportDb } from "./importMobilis";
import { testMigrationsFor } from "./testMigration";
import { type BackupStore, type MigrationResult, migrateProtected } from "./migrate";
import * as schema from "./schema";

export const DB_NAME = "notebus.db";
/** Lista das cópias (o expo-sqlite não lista arquivos). Arquivo à parte: restaurar o banco não o apaga. */
const BACKUP_CATALOG = "notebus-backups.db";

export async function openNotebusDb(): Promise<{
  db: ReturnType<typeof drizzle<typeof schema>>;
  migration: MigrationResult;
}> {
  const sqlite = await SQLite.openDatabaseAsync(DB_NAME);
  const migration = await migrateProtected({
    db: {
      exec: (sql) => sqlite.execAsync(sql),
      userVersion: async () =>
        (await sqlite.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version ?? 0,
    },
    backups: await expoBackupStore(sqlite),
    // Só com a variável de build de teste (A6/A7); em build normal é lista vazia.
    migrations: [...migrations, ...testMigrationsFor(process.env.EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION)],
  });
  return { db: drizzle(sqlite, { schema }), migration };
}

/** Adaptador do importador da MOBILIS (`importMobilis.ts`) para o expo-sqlite. Provado no iPhone (bloco 4b). */
export function expoImportDb(sqlite: SQLite.SQLiteDatabase): ImportDb {
  return {
    exec: (sql) => sqlite.execAsync(sql),
    run: async (sql, params) => ({ changes: (await sqlite.runAsync(sql, params)).changes }),
    all: (sql, params) => sqlite.getAllAsync(sql, params),
  };
}

/** Cópia com a API de backup do SQLite (cópia página a página do banco inteiro). */
async function expoBackupStore(main: SQLite.SQLiteDatabase): Promise<BackupStore> {
  const catalog = await SQLite.openDatabaseAsync(BACKUP_CATALOG);
  await catalog.execAsync("CREATE TABLE IF NOT EXISTS backup (name TEXT PRIMARY KEY NOT NULL)");

  async function copy(from: SQLite.SQLiteDatabase | string, to: SQLite.SQLiteDatabase | string) {
    const src = typeof from === "string" ? await SQLite.openDatabaseAsync(from) : from;
    const dest = typeof to === "string" ? await SQLite.openDatabaseAsync(to) : to;
    try {
      await SQLite.backupDatabaseAsync({ sourceDatabase: src, destDatabase: dest });
    } finally {
      if (src !== main) await src.closeAsync();
      if (dest !== main) await dest.closeAsync();
    }
  }

  return {
    async create(name) {
      await copy(main, name);
      await catalog.runAsync("INSERT OR IGNORE INTO backup (name) VALUES (?)", name);
    },
    restore: (name) => copy(name, main),
    async list() {
      return (await catalog.getAllAsync<{ name: string }>("SELECT name FROM backup")).map((r) => r.name);
    },
    async remove(name) {
      await SQLite.deleteDatabaseAsync(name);
      await catalog.runAsync("DELETE FROM backup WHERE name = ?", name);
    },
  };
}
