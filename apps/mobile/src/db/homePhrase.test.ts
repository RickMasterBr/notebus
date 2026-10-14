/// <reference types="node" />
/**
 * Testes da chave home_last_phrase no setting (E-08.5 Bloco 17, Item 3).
 * Fica exclusivamente no aparelho e fora do backup.
 */
import { BACKUP_SETTING_KEYS } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { readBackupInput } from "./backup";
import {
  HOME_LAST_PHRASE_KEY,
  readLastPhraseId,
  writeLastPhraseId,
} from "./homePhrase";
import type { ImportDb } from "./importMobilis";
import { setting } from "./schema";
import { startEmpty } from "./startEmpty";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_792_051_200_000;

function fresh() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  return { db, raw, sqlite };
}

describe("db/homePhrase: persistência da última frase e fora do backup (Item 3, D-207)", () => {
  it("ler sem linha -> null", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    expect(await readLastPhraseId(db)).toBeNull();
  });

  it("gravar e ler", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeLastPhraseId(db, "invite_where", NOW);
    expect(await readLastPhraseId(db)).toBe("invite_where");
  });

  it("sobrescrever troca o valor mantendo uma linha só no banco", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeLastPhraseId(db, "invite_where", NOW);
    await writeLastPhraseId(db, "arriving_minutes", NOW + 1000);
    expect(await readLastPhraseId(db)).toBe("arriving_minutes");

    const rows = await db.select().from(setting).where(eq(setting.key, HOME_LAST_PHRASE_KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("arriving_minutes");
  });

  it("id desconhecido gravado à mão -> null sem exceção", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    // Insere diretamente um id inexistente no enum
    await db.insert(setting).values({
      id: "fake-id",
      key: HOME_LAST_PHRASE_KEY,
      value: "unknown_phrase_123",
      source: "user",
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    expect(await readLastPhraseId(db)).toBeNull();
  });

  it("linha apagada logicamente reativa ao gravar", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeLastPhraseId(db, "invite_line", NOW);
    expect(await readLastPhraseId(db)).toBe("invite_line");

    // Marca como apagada logicamente
    await db
      .update(setting)
      .set({ deletedAt: NOW + 1000, updatedAt: NOW + 1000 })
      .where(eq(setting.key, HOME_LAST_PHRASE_KEY));
    expect(await readLastPhraseId(db)).toBeNull();

    // Grava de novo -> reativa com deletedAt null
    await writeLastPhraseId(db, "invite_first_bus", NOW + 2000);
    expect(await readLastPhraseId(db)).toBe("invite_first_bus");

    const rows = await db.select().from(setting).where(eq(setting.key, HOME_LAST_PHRASE_KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deletedAt).toBeNull();
    expect(rows[0]?.value).toBe("invite_first_bus");
  });

  it("fora do backup: BACKUP_SETTING_KEYS não contém HOME_LAST_PHRASE_KEY e readBackupInput não carrega a chave", async () => {
    // (a) BACKUP_SETTING_KEYS não contém a chave
    expect(BACKUP_SETTING_KEYS).not.toContain(HOME_LAST_PHRASE_KEY);

    // (b) Exportação de backup não traz a chave
    const { db, raw } = fresh();
    await startEmpty(db, NOW);
    await writeLastPhraseId(db, "invite_where", NOW);

    const backupInput = await readBackupInput(raw, { now: NOW, appVersion: "1.0.0" });
    const settingRows = backupInput.tables.setting ?? [];
    const phraseRow = settingRows.find((r) => r.key === HOME_LAST_PHRASE_KEY);
    expect(phraseRow).toBeUndefined();
  });
});
