/// <reference types="node" />
// Só teste: roda no Node, não no app.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { selectLive } from "./query";
import * as schema from "./schema";
import { testDb } from "./testing/drizzleTestDb";

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
