/// <reference types="node" />
/**
 * Testes dos fatos e dispensa do cartão de guia com banco real (D-091, D-196, D-202).
 * Molde de startEmptyJourney.test.ts, dados inventados.
 */
import { createHash } from "node:crypto";
import { officialId, serializeBackup, uuidv7 } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { readBackupInput } from "./backup";
import { dismissHomeGuide, HOME_GUIDE_DISMISSED, isHomeGuideDismissed, readHomeGuideFacts } from "./homeGuide";
import type { ImportDb } from "./importMobilis";
import { createLine } from "./lineCreate";
import { dataset, setting, stop } from "./schema";
import { startEmpty } from "./startEmpty";
import { createStop } from "./stopCreate";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const NOW = 1_792_051_200_000; // 15/10/2026 08:00 UTC
const stopValues = (name: string) => ({ name, aliases: [], externalId: null, note: null });

function fresh() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  return { db, raw };
}

describe("db/homeGuide: fatos e dispensa do cartão de guia (Item 2)", () => {
  it("sem dataset -> false, com dataset -> true", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    // Sem dataset
    const factsBefore = await readHomeGuideFacts(db);
    expect(factsBefore.hasDataset).toBe(false);

    // Com dataset inserido
    await db.insert(dataset).values({
      id: uuidv7(NOW),
      createdAt: NOW,
      updatedAt: NOW,
      source: "official",
      networkId: officialId("notebus/user/network"),
      name: "mobilis",
      version: "2026-09-01",
      importedAt: NOW,
      checksum: "dummy_checksum",
    });

    const factsAfter = await readHomeGuideFacts(db);
    expect(factsAfter.hasDataset).toBe(true);
  });

  it("dois pontos de usuário criados em instantes diferentes -> lastStop é o mais novo", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const s1 = await createStop(db, stopValues("Ponto Mais Antigo"), NOW);
    const s2 = await createStop(db, stopValues("Ponto Mais Novo"), NOW + 10_000);
    expect(s1.ok && s2.ok).toBe(true);

    const facts = await readHomeGuideFacts(db);
    expect(facts.lastStop).toEqual({ id: (s2 as { id: string }).id, name: "Ponto Mais Novo" });
  });

  it("ponto apagado não conta", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const s1 = await createStop(db, stopValues("Ponto Vivo"), NOW);
    const s2 = await createStop(db, stopValues("Ponto Apagado"), NOW + 5_000);
    expect(s1.ok && s2.ok).toBe(true);

    // Apaga s2
    await db
      .update(stop)
      .set({ deletedAt: NOW + 6_000 })
      .where(eq(stop.id, (s2 as { id: string }).id));

    const facts = await readHomeGuideFacts(db);
    expect(facts.lastStop).toEqual({ id: (s1 as { id: string }).id, name: "Ponto Vivo" });
  });

  it("ponto oficial não conta", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const sUser = await createStop(db, stopValues("Ponto Do Usuário"), NOW);
    expect(sUser.ok).toBe(true);

    // Ponto oficial com createdAt mais recente
    await db.insert(stop).values({
      id: officialId("mobilis/stop/OFFICIAL_NEWER"),
      createdAt: NOW + 100_000,
      updatedAt: NOW + 100_000,
      source: "official",
      networkId: officialId("notebus/user/network"),
      name: "Ponto Oficial",
      aliases: [],
      externalId: null,
      lat: null,
      lon: null,
      locationSource: null,
      note: null,
    });

    const facts = await readHomeGuideFacts(db);
    expect(facts.lastStop).toEqual({ id: (sUser as { id: string }).id, name: "Ponto Do Usuário" });
  });

  it("duas linhas -> lastLineFirstStop é a primeira paragem da mais nova", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    const pA = await createStop(db, stopValues("Paragem A"), NOW);
    const pB = await createStop(db, stopValues("Paragem B"), NOW + 1_000);
    const pC = await createStop(db, stopValues("Paragem C"), NOW + 2_000);
    if (!pA.ok || !pB.ok || !pC.ok) throw new Error("Falha ao criar pontos");

    // Linha 1 mais antiga: paragens [A, B]
    const l1 = await createLine(
      db,
      {
        code: "1",
        name: "Linha Velha",
        color: "#5B4BD6",
        pattern: { label: "Ida", stopIds: [pA.id, pB.id] },
        durationMinutes: 15,
        dayTypeCodes: ["weekday"],
        departures: [{ hour: 8, minute: 0 }],
      },
      NOW + 3_000,
    );
    expect(l1.ok).toBe(true);

    // Linha 2 mais nova: paragens [C, A]
    const l2 = await createLine(
      db,
      {
        code: "2",
        name: "Linha Nova",
        color: "#1E3A8A",
        pattern: { label: "Ida", stopIds: [pC.id, pA.id] },
        durationMinutes: 20,
        dayTypeCodes: ["weekday"],
        departures: [{ hour: 9, minute: 0 }],
      },
      NOW + 10_000,
    );
    expect(l2.ok).toBe(true);

    const facts = await readHomeGuideFacts(db);
    expect(facts.lastLineFirstStop).toEqual({ id: pC.id, name: "Paragem C" });
  });

  it("dispensar grava uma vez e isHomeGuideDismissed passa a true", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);

    expect(await isHomeGuideDismissed(db)).toBe(false);

    await dismissHomeGuide(db, NOW);
    expect(await isHomeGuideDismissed(db)).toBe(true);

    // Chamar de novo não quebra nem duplica erro
    await dismissHomeGuide(db, NOW + 1_000);
    expect(await isHomeGuideDismissed(db)).toBe(true);
  });

  it("a chave não vai no backup", async () => {
    const { db, raw } = fresh();
    await startEmpty(db, NOW);

    // Grava a dispensa
    await dismissHomeGuide(db, NOW);
    expect(await isHomeGuideDismissed(db)).toBe(true);

    // Confere se está no banco
    const rows = await db.select().from(setting).where(eq(setting.key, HOME_GUIDE_DISMISSED));
    expect(rows).toHaveLength(1);

    // Lê os dados de backup e serializa
    const backupInput = await readBackupInput(raw, { now: NOW, appVersion: "1.0.0" });
    const settingRows = backupInput.tables.setting ?? [];
    const found = settingRows.some((r) => r.key === HOME_GUIDE_DISMISSED);
    expect(found, "home_guide_dismissed não pode ir na tabela setting do backup").toBe(false);

    const serialized = await serializeBackup(backupInput, sha256);
    expect(serialized).not.toContain(HOME_GUIDE_DISMISSED);
  });
});
