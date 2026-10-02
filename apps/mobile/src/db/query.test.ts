/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { selectLive } from "./query";
import * as schema from "./schema";

/** Drizzle de verdade sobre o node:sqlite (driver proxy do próprio drizzle-orm). */
function testDb() {
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
  return db;
}

describe("selectLive (§4.7)", () => {
  it("nunca devolve linha apagada e aceita condições extras", async () => {
    const db = testDb();
    const base = { createdAt: 1, updatedAt: 1, source: "user" as const };
    await db.insert(schema.place).values([
      { ...base, id: "casa", name: "Casa" },
      { ...base, id: "facul", name: "Facul" },
      { ...base, id: "velho", name: "Velho", deletedAt: 2 },
    ]);

    expect((await selectLive(db, schema.place)).map((p) => p.id).sort()).toEqual(["casa", "facul"]);
    expect((await selectLive(db, schema.place, eq(schema.place.name, "Velho"))).length).toBe(0);
    expect((await selectLive(db, schema.place, eq(schema.place.name, "Casa"))).map((p) => p.id)).toEqual(["casa"]);
  });
});
