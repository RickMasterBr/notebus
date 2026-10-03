/** Inicialização de um banco Drizzle em memória para uso em testes via node:sqlite. */
/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "../migrations";
import * as schema from "../schema";

/**
 * Inicializa um banco SQLite em memória com o schema completo aplicado,
 * e acopla a ele uma instância do Drizzle ORM via driver proxy.
 * Usado exclusivamente nos testes para ter um banco "real" e leve rodando no Node.
 */
export function testDbWithSqlite() {
  const sqlite = new DatabaseSync(":memory:");
  for (const m of migrations) for (const s of m.sql.split("--> statement-breakpoint")) sqlite.exec(s);
  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      const rows = stmt.all(...(params as never[])).map((r) => Object.values(r as object));
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
  return { db, sqlite };
}

export const testDb = () => testDbWithSqlite().db;
