/// <reference types="node" />
/**
 * Testes do nome do usuário no setting (E-08.5 Bloco 15, D-203, D-204).
 * Fica no aparelho e fora do backup.
 */
import { BACKUP_SETTING_KEYS } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { readBackupInput } from "./backup";
import type { ImportDb } from "./importMobilis";
import { setting } from "./schema";
import { startEmpty } from "./startEmpty";
import { testDbWithSqlite } from "./testing/drizzleTestDb";
import { clearUserName, readUserName, USER_NAME_KEY, writeUserName } from "./userName";

const NOW = 1_792_051_200_000; // 15/10/2026 08:00 UTC

function fresh() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  return { db, raw, sqlite };
}

describe("db/userName: persistência e fora do backup (Item 2, D-203, D-204)", () => {
  it("ler sem linha -> null", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    expect(await readUserName(db)).toBeNull();
  });

  it("gravar '  Richard  ' -> lê 'Richard'", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeUserName(db, "  Richard  ", NOW);
    expect(await readUserName(db)).toBe("Richard");
  });

  it("gravar de novo troca o valor mantendo uma linha só no banco", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeUserName(db, "Richard", NOW);
    await writeUserName(db, "Rick", NOW + 1000);
    expect(await readUserName(db)).toBe("Rick");

    const rows = await db.select().from(setting).where(eq(setting.key, USER_NAME_KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe("Rick");
  });

  it("clearUserName -> null e gravar depois revive a linha", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeUserName(db, "Richard", NOW);
    expect(await readUserName(db)).toBe("Richard");

    await clearUserName(db, NOW + 1000);
    expect(await readUserName(db)).toBeNull();

    // A linha continua no banco, mas com deletedAt
    const rawRows = await db.select().from(setting).where(eq(setting.key, USER_NAME_KEY));
    expect(rawRows).toHaveLength(1);
    expect(rawRows[0]?.deletedAt).toBe(NOW + 1000);

    // Gravar de novo revive
    await writeUserName(db, "Lopes", NOW + 2000);
    expect(await readUserName(db)).toBe("Lopes");
    const revivedRows = await db.select().from(setting).where(eq(setting.key, USER_NAME_KEY));
    expect(revivedRows).toHaveLength(1);
    expect(revivedRows[0]?.deletedAt).toBeNull();
  });

  it("gravar vazio ('   ') apaga", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    await writeUserName(db, "Richard", NOW);
    expect(await readUserName(db)).toBe("Richard");

    await writeUserName(db, "   ", NOW + 1000);
    expect(await readUserName(db)).toBeNull();
  });

  it("fora do backup: BACKUP_SETTING_KEYS não contém USER_NAME_KEY e readBackupInput não traz o nome", async () => {
    // Guarda do domínio
    expect(BACKUP_SETTING_KEYS).not.toContain(USER_NAME_KEY);

    const { db, raw } = fresh();
    await startEmpty(db, NOW);
    await writeUserName(db, "Richard", NOW);

    // Exportação do backup via readBackupInput
    const backupInput = await readBackupInput(raw, { now: NOW, appVersion: "1.0.0" });
    const settingRows = backupInput.tables.setting ?? [];
    const nameRow = settingRows.find((r) => r.key === USER_NAME_KEY);
    expect(nameRow).toBeUndefined();
  });
});
