/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { inTransaction, type AnyDb } from "./inTransaction";

/** Um pedaço do `sql` do Drizzle: o texto fica em `value` (StringChunk). */
type Chunk = { value?: string[] };

const textOf = (query: unknown): string =>
  ((query as { queryChunks?: Chunk[] }).queryChunks ?? []).map((chunk) => chunk.value?.join("") ?? "").join("");

/** Banco falso: registra o SQL que a transação manda e pode falhar no `rollback`. */
function fakeDb(options: { failRollback?: boolean } = {}) {
  const calls: string[] = [];
  const db = {
    run: async (query: unknown) => {
      const text = textOf(query);
      calls.push(text);
      if (text === "rollback" && options.failRollback) throw new Error("erro do rollback");
    },
  };
  return { db: db as unknown as AnyDb, calls };
}

describe("inTransaction compartilhada · commit, rollback e o erro que sobe", () => {
  it("faz commit no sucesso e devolve o resultado do corpo", async () => {
    const { db, calls } = fakeDb();
    const result = await inTransaction(db, async () => "feito");
    expect(result).toBe("feito");
    expect(calls).toEqual(["begin immediate", "commit"]);
  });

  it("faz rollback na falha e sobe o erro do corpo", async () => {
    const { db, calls } = fakeDb();
    await expect(
      inTransaction(db, async () => {
        throw new Error("erro do corpo");
      }),
    ).rejects.toThrow("erro do corpo");
    expect(calls).toEqual(["begin immediate", "rollback"]);
  });

  it("quando o corpo e o rollback falham, sobe o erro do corpo (o caso que data/registro.ts tinha diferente)", async () => {
    const { db, calls } = fakeDb({ failRollback: true });
    await expect(
      inTransaction(db, async () => {
        throw new Error("erro do corpo");
      }),
    ).rejects.toThrow("erro do corpo");
    expect(calls).toEqual(["begin immediate", "rollback"]);
  });
});
