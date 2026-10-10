import { describe, expect, it } from "vitest";
import { markFirstRunDone, needsFirstRun } from "./appState";
import * as schema from "./schema";
import { testDb } from "./testing/drizzleTestDb";

describe("primeiro uso", () => {
  it("banco novo pede a TL-13; marcado ou com dataset, não", async () => {
    const db = testDb();
    expect(await needsFirstRun(db)).toBe(true);
    await markFirstRunDone(db, 10);
    await markFirstRunDone(db, 20); // repetir não duplica
    expect(await needsFirstRun(db)).toBe(false);
    expect(await db.select().from(schema.setting)).toHaveLength(1);

    const outro = testDb();
    await outro.insert(schema.dataset).values({
      id: "d1", createdAt: 1, updatedAt: 1, source: "official", networkId: "n", name: "MOBILIS", version: "2026-09-01", importedAt: 1, checksum: "x",
    });
    expect(await needsFirstRun(outro)).toBe(false);
  });

  it("orientação do modo foco: começa falso, marcado vira verdadeiro e não duplica", async () => {
    const { hasShownAlarmFocusHint, markAlarmFocusHintShown } = await import("./appState");
    const db = testDb();
    expect(await hasShownAlarmFocusHint(db)).toBe(false);
    await markAlarmFocusHintShown(db, 10);
    await markAlarmFocusHintShown(db, 20); // idempotente
    expect(await hasShownAlarmFocusHint(db)).toBe(true);
  });
});

describe("última posição do mapa (last_map_position)", () => {
  it("ida e volta: grava posição e lê idêntica; atualizar não duplica", async () => {
    const { readLastMapPosition, writeLastMapPosition, LAST_MAP_POSITION } = await import("./appState");
    const db = testDb();

    // Começa nulo
    expect(await readLastMapPosition(db)).toBeNull();

    // Grava e lê
    const p1 = { lat: 39.7437, lon: -8.8071 };
    await writeLastMapPosition(db, p1, 100);
    expect(await readLastMapPosition(db)).toEqual(p1);

    // Atualiza
    const p2 = { lat: 39.75, lon: -8.82 };
    await writeLastMapPosition(db, p2, 200);
    expect(await readLastMapPosition(db)).toEqual(p2);

    // Confere que há apenas uma linha na tabela setting
    const rows = await db.select().from(schema.setting);
    const mapRows = rows.filter((r) => r.key === LAST_MAP_POSITION);
    expect(mapRows).toHaveLength(1);
  });

  it("valor inválido ou ausente vira null", async () => {
    const { readLastMapPosition, LAST_MAP_POSITION } = await import("./appState");
    const db = testDb();

    // 1. Ausente
    expect(await readLastMapPosition(db)).toBeNull();

    // 2. Não-objeto ou array
    await db.insert(schema.setting).values({
      id: "s1",
      createdAt: 1,
      updatedAt: 1,
      source: "user",
      key: LAST_MAP_POSITION,
      value: [1, 2] as any,
    });
    expect(await readLastMapPosition(db)).toBeNull();

    // 3. lat/lon ausentes ou não numéricos
    await db.update(schema.setting).set({ value: { lat: "39.7", lon: -8.8 } as any });
    expect(await readLastMapPosition(db)).toBeNull();

    // 4. Coordenada inválida: (0, 0)
    await db.update(schema.setting).set({ value: { lat: 0, lon: 0 } });
    expect(await readLastMapPosition(db)).toBeNull();

    // 5. Fora da faixa
    await db.update(schema.setting).set({ value: { lat: 95, lon: -8.8 } });
    expect(await readLastMapPosition(db)).toBeNull();
  });

  it("prova de que o backup não leva a chave last_map_position", async () => {
    const { createHash } = await import("node:crypto");
    const { serializeBackup } = await import("@notebus/domain");
    const { readLastMapPosition, writeLastMapPosition, LAST_MAP_POSITION } = await import("./appState");
    const { readBackupInput } = await import("./backup");
    const { backupScenario, SCENARIO_NOW } = await import("./testing/backupScenario");

    const src = await backupScenario();
    const pos = { lat: 39.7437, lon: -8.8071 };
    await writeLastMapPosition(src.db, pos, SCENARIO_NOW);

    // Confere que a posição existe no banco de dados local
    expect(await readLastMapPosition(src.db)).toEqual(pos);
    const dbSettingRows = (src.raw.all("SELECT * FROM setting WHERE key = ?", [LAST_MAP_POSITION])) as any[];
    expect(dbSettingRows).toHaveLength(1);

    // Lê os dados preparados para exportação do backup
    const backupInput = await readBackupInput(src.raw, { now: SCENARIO_NOW, appVersion: "1.0.0" });
    const exportedSettingRows = backupInput.tables.setting ?? [];

    // Prova 1: tables.setting não contém a chave last_map_position
    expect(exportedSettingRows.some((r) => r.key === LAST_MAP_POSITION)).toBe(false);

    // Prova 2: o JSON serializado do backup não contém a chave
    const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
    const backupText = await serializeBackup(backupInput, sha256);
    expect(backupText.includes(LAST_MAP_POSITION)).toBe(false);
  });
});

describe("soneca do mapa offline (offline_map_snoozed_until)", () => {
  it("ida e volta: grava timestamp e lê idêntico; atualizar não duplica", async () => {
    const { readOfflineSnooze, writeOfflineSnooze } = await import("./appState");
    const { OFFLINE_SNOOZED_UNTIL } = await import("../data/mapOfflineState");
    const db = testDb();

    // Começa nulo
    expect(await readOfflineSnooze(db)).toBeNull();

    // Grava e lê
    const until1 = 1_800_000_000_000;
    await writeOfflineSnooze(db, until1, 100);
    expect(await readOfflineSnooze(db)).toBe(until1);

    // Atualiza
    const until2 = 1_800_604_800_000;
    await writeOfflineSnooze(db, until2, 200);
    expect(await readOfflineSnooze(db)).toBe(until2);

    // Confere que há apenas uma linha na tabela setting com a chave
    const rows = await db.select().from(schema.setting);
    const snoozeRows = rows.filter((r) => r.key === OFFLINE_SNOOZED_UNTIL);
    expect(snoozeRows).toHaveLength(1);
  });

  it("valor inválido ou ausente vira null", async () => {
    const { readOfflineSnooze } = await import("./appState");
    const { OFFLINE_SNOOZED_UNTIL } = await import("../data/mapOfflineState");
    const db = testDb();

    // 1. Ausente
    expect(await readOfflineSnooze(db)).toBeNull();

    // 2. Não-numérico
    await db.insert(schema.setting).values({
      id: "s1",
      createdAt: 1,
      updatedAt: 1,
      source: "user",
      key: OFFLINE_SNOOZED_UNTIL,
      value: "invalid" as any,
    });
    expect(await readOfflineSnooze(db)).toBeNull();

    // 3. Número <= 0
    await db.update(schema.setting).set({ value: 0 as any });
    expect(await readOfflineSnooze(db)).toBeNull();

    await db.update(schema.setting).set({ value: -100 as any });
    expect(await readOfflineSnooze(db)).toBeNull();
  });

  it("garante que OFFLINE_SNOOZED_UNTIL não entra em BACKUP_SETTING_KEYS nem no backup", async () => {
    const { BACKUP_SETTING_KEYS, serializeBackup } = await import("@notebus/domain");
    const { OFFLINE_SNOOZED_UNTIL } = await import("../data/mapOfflineState");
    const { readOfflineSnooze, writeOfflineSnooze } = await import("./appState");
    const { readBackupInput } = await import("./backup");
    const { backupScenario, SCENARIO_NOW } = await import("./testing/backupScenario");
    const { createHash } = await import("node:crypto");

    // 1. Não entra na lista de chaves de backup do domínio
    expect((BACKUP_SETTING_KEYS as readonly string[]).includes(OFFLINE_SNOOZED_UNTIL)).toBe(false);

    // 2. Não é exportado na rotina de backup
    const src = await backupScenario();
    await writeOfflineSnooze(src.db, SCENARIO_NOW + 100_000, SCENARIO_NOW);
    expect(await readOfflineSnooze(src.db)).toBe(SCENARIO_NOW + 100_000);

    const backupInput = await readBackupInput(src.raw, { now: SCENARIO_NOW, appVersion: "1.0.0" });
    const exportedSettingRows = backupInput.tables.setting ?? [];
    expect(exportedSettingRows.some((r) => r.key === OFFLINE_SNOOZED_UNTIL)).toBe(false);

    const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
    const backupText = await serializeBackup(backupInput, sha256);
    expect(backupText.includes(OFFLINE_SNOOZED_UNTIL)).toBe(false);
  });
});

