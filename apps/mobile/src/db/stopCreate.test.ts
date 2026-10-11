/// <reference types="node" />
/**
 * Criação de ponto no banco (E-08 §5.4, bloco 7, Item 1): grava como ponto seu, recusa o que é inválido ou repetido, desfaz só se nada mudou.
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH } from "../data/stopEdit";
import { exampleNetworkSeed, stopId } from "../data/registroFixture";
import { type ImportDb, importMobilis } from "./importMobilis";
import { listStops } from "./networkList";
import { stop } from "./schema";
import { createStop } from "./stopCreate";
import { saveStopEdit } from "./stopEdit";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const values = (over: Partial<{ name: string; aliases: string[]; externalId: string | null; note: string | null }> = {}) => ({
  name: "Ponto do Rick",
  aliases: ["Casa"],
  externalId: null,
  note: null,
  ...over,
});

async function setup(withNetwork = true) {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  if (withNetwork) await importMobilis(raw, exampleNetworkSeed());
  return { db };
}

describe("createStop", () => {
  it("o ponto criado aparece em listStops e fica como ponto seu, sem chave oficial nem localização", async () => {
    const { db } = await setup();
    const res = await createStop(db, values({ externalId: " X-1 ", note: " perto da escola " }), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect((await listStops(db)).find((s) => s.id === res.id)).toMatchObject({
      name: "Ponto do Rick",
      aliases: ["Casa"],
      externalId: "X-1",
      source: "user",
    });
    const row = (await db.select().from(stop).where(eq(stop.id, res.id)))[0]!;
    expect(row).toMatchObject({
      source: "user",
      officialKey: null,
      lat: null,
      lon: null,
      locationSource: null,
      note: "perto da escola",
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    const network = (await db.select().from(stop).where(eq(stop.id, stopId("A"))))[0]!;
    expect(row.networkId).toBe(network.networkId);
  });

  it("usa o gerador de id recebido", async () => {
    const { db } = await setup();
    const res = await createStop(db, values(), NOW, { newId: () => "id-fixo" });
    expect(res).toMatchObject({ ok: true, id: "id-fixo" });
  });

  it("nome vazio, só espaços ou com 81 caracteres → invalid", async () => {
    const { db } = await setup();
    for (const name of ["", "   ", "x".repeat(MAX_NAME_LENGTH + 1)]) {
      expect(await createStop(db, values({ name }), NOW)).toEqual({ ok: false, reason: "invalid" });
    }
    expect((await createStop(db, values({ name: "x".repeat(MAX_NAME_LENGTH) }), NOW)).ok).toBe(true);
  });

  it("nota de 201 caracteres e ID externo de 21 → invalid", async () => {
    const { db } = await setup();
    expect(await createStop(db, values({ note: "n".repeat(201) }), NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(await createStop(db, values({ externalId: "9".repeat(21) }), NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ID externo repetido, em outro caso e em outra caixa → duplicate_external_id", async () => {
    const { db } = await setup();
    expect((await createStop(db, values({ externalId: "ab-1" }), NOW)).ok).toBe(true);
    expect(await createStop(db, values({ name: "Outro", externalId: "ab-1" }), NOW + 1)).toEqual({
      ok: false,
      reason: "duplicate_external_id",
    });
    expect(await createStop(db, values({ name: "Outro", externalId: "AB-1" }), NOW + 1)).toEqual({
      ok: false,
      reason: "duplicate_external_id",
    });
  });

  it("o ID externo de um ponto apagado pode ser reusado", async () => {
    const { db } = await setup();
    const first = await createStop(db, values({ externalId: "7" }), NOW);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await first.undo(NOW + 10)).toEqual({ ok: true });
    expect((await createStop(db, values({ name: "Depois", externalId: "7" }), NOW + 20)).ok).toBe(true);
  });

  it("sem rede viva → no_network", async () => {
    const { db } = await setup(false);
    expect(await createStop(db, values(), NOW)).toEqual({ ok: false, reason: "no_network" });
  });

  it("Desfazer apaga o ponto: some da lista e fica com deletedAt e updatedAt crescentes", async () => {
    const { db } = await setup();
    const res = await createStop(db, values(), NOW);
    if (!res.ok) throw new Error("criação falhou");
    expect(await res.undo(NOW - 5)).toEqual({ ok: true });
    expect((await listStops(db)).some((s) => s.id === res.id)).toBe(false);
    const row = (await db.select().from(stop).where(eq(stop.id, res.id)))[0]!;
    expect(row.deletedAt).toBe(NOW + 1);
    expect(row.updatedAt).toBe(NOW + 1);
  });

  it("Desfazer depois de editar → stale, e o ponto continua", async () => {
    const { db } = await setup();
    const res = await createStop(db, values(), NOW);
    if (!res.ok) throw new Error("criação falhou");
    expect((await saveStopEdit(db, res.id, values({ name: "Renomeado" }), NOW + 100)).ok).toBe(true);
    expect(await res.undo(NOW + 200)).toEqual({ ok: false, reason: "stale" });
    expect((await listStops(db)).find((s) => s.id === res.id)?.name).toBe("Renomeado");
  });

  it("Desfazer duas vezes → a segunda é stale", async () => {
    const { db } = await setup();
    const res = await createStop(db, values(), NOW);
    if (!res.ok) throw new Error("criação falhou");
    expect(await res.undo(NOW + 5)).toEqual({ ok: true });
    expect(await res.undo(NOW + 6)).toEqual({ ok: false, reason: "stale" });
  });
});
