/// <reference types="node" />
/**
 * "Começar do zero" (E-08.5 bloco 7, D-201): cria a rede do usuário, para o primeiro ponto e a primeira linha funcionarem.
 * Dados inventados (D-091).
 */
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { markFirstRunDone, needsFirstRun } from "./appState";
import { importBackup, readBackupInput } from "./backup";
import { type ImportDb, DAY_TYPES, importMobilis } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { dayType, holiday, network, setting, stop } from "./schema";
import { ensureUserNetwork, startEmpty, USER_NETWORK_ID, USER_NETWORK_NAME, USER_NETWORK_TIMEZONE, userDayTypeId } from "./startEmpty";
import { createStop } from "./stopCreate";
import { lineSeed } from "./testing/lineSeed";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const NOW = 1_800_000_000_000;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const stopValues = { name: "Ponto do Rick", aliases: [], externalId: null, note: null };

function fresh() {
  const { db, sqlite } = testDbWithSqlite();
  const raw: ImportDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params) => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }),
    all: (sql, params) => sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
  };
  return { db, raw };
}

const noBackups: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };

async function counts(db: ReturnType<typeof fresh>["db"]) {
  return {
    network: (await db.select().from(network)).length,
    dayType: (await db.select().from(dayType)).length,
    holiday: (await db.select().from(holiday)).length,
    firstRun: (await db.select().from(setting).where(eq(setting.key, "first_run_done"))).length,
  };
}

/** Faz o backup de um banco e devolve o texto. */
const exportText = async (raw: ImportDb) => serializeBackup(await readBackupInput(raw, { now: NOW, appVersion: "1.0.0" }), sha256);

/** Lê e valida o texto como a tela de importar faz; devolve o arquivo pronto para `importBackup`. */
async function validated(raw: ImportDb, text: string) {
  const preview = await prepareImport(raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  return preview.file;
}

describe("o defeito antes do startEmpty", () => {
  it("hoje: só marcar o primeiro uso não basta (A3)", async () => {
    const { db } = fresh();
    expect(await needsFirstRun(db)).toBe(true);
    await markFirstRunDone(db, NOW);
    expect(await createStop(db, stopValues, NOW)).toEqual({ ok: false, reason: "no_network" });
  });
});

describe("startEmpty (D-201)", () => {
  it("T-134 · banco limpo → startEmpty → createStop dá ok e o primeiro uso acaba", async () => {
    const { db } = fresh();
    expect(await needsFirstRun(db)).toBe(true);
    await startEmpty(db, NOW);
    expect(await needsFirstRun(db)).toBe(false);
    expect((await createStop(db, stopValues, NOW)).ok).toBe(true);
  });

  it("grava a rede, os 3 tipos de dia e nenhum feriado", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    expect(await db.select().from(network)).toEqual([
      expect.objectContaining({ id: USER_NETWORK_ID, name: USER_NETWORK_NAME, timezone: USER_NETWORK_TIMEZONE, source: "user", officialKey: null, deletedAt: null }),
    ]);
    const days = await db.select().from(dayType);
    expect(days.map((d) => [d.code, d.name, d.sort, d.id, d.networkId, d.source]).sort()).toEqual(
      Object.entries(DAY_TYPES)
        .map(([code, d]) => [code, d.name, d.sort, userDayTypeId(code as keyof typeof DAY_TYPES), USER_NETWORK_ID, "user"])
        .sort(),
    );
    expect(days.map((d) => d.code).sort()).toEqual(["saturday", "sunday_holiday", "weekday"]);
    expect(await db.select().from(holiday)).toEqual([]);
  });

  it("duas vezes: mesmas linhas, nada duplicado, sem erro", async () => {
    const { db } = fresh();
    await startEmpty(db, NOW);
    const first = await counts(db);
    await startEmpty(db, NOW + 1);
    expect(await counts(db)).toEqual(first);
    expect(first).toEqual({ network: 1, dayType: 3, holiday: 0, firstRun: 1 });
  });

  it("tudo ou nada: se falha depois da rede, não fica rede, tipo de dia nem primeiro uso", async () => {
    const { db } = fresh();
    const afterNetwork = () => {
      throw new Error("falha no meio");
    };
    await expect(startEmpty(db, NOW, { afterNetwork })).rejects.toThrow("falha no meio");
    expect(await counts(db)).toEqual({ network: 0, dayType: 0, holiday: 0, firstRun: 0 });
    expect(await needsFirstRun(db)).toBe(true);
  });
});

describe("ensureUserNetwork", () => {
  it("com o primeiro uso marcado e sem rede: cria, e depois createStop dá ok", async () => {
    const { db } = fresh();
    await markFirstRunDone(db, NOW);
    expect(await ensureUserNetwork(db, NOW)).toBe("created");
    expect((await createStop(db, stopValues, NOW)).ok).toBe(true);
  });

  it("com a rede da MOBILIS importada: mantém, continua uma rede só", async () => {
    const { db, raw } = fresh();
    await importMobilis(
      raw,
      lineSeed({ S: "Estação Inventada", K: "Campus Exemplo" }, [
        { code: "1", color: "#7CB342", stops: [{ stop: "S", timepoint: true }, { stop: "K", timepoint: true }], trips: [{ id: "0810", days: ["weekday"], times: { 1: 490, 2: 520 } }] },
      ]),
    );
    await markFirstRunDone(db, NOW);
    expect(await ensureUserNetwork(db, NOW)).toBe("kept");
    const nets = await db.select().from(network);
    expect(nets).toHaveLength(1);
    expect(nets[0]!.source).toBe("official");
  });

  it("sem o primeiro uso marcado (banco limpo): mantém e não grava nada", async () => {
    const { db } = fresh();
    expect(await ensureUserNetwork(db, NOW)).toBe("kept");
    expect(await counts(db)).toEqual({ network: 0, dayType: 0, holiday: 0, firstRun: 0 });
  });

  it("duas vezes: a segunda mantém", async () => {
    const { db } = fresh();
    await markFirstRunDone(db, NOW);
    expect(await ensureUserNetwork(db, NOW)).toBe("created");
    expect(await ensureUserNetwork(db, NOW + 1)).toBe("kept");
    expect((await counts(db)).network).toBe(1);
  });
});

describe("backup do zero (T-135)", () => {
  it("reinstalar, começar do zero de novo e importar o backup não duplica a rede nem os tipos de dia", async () => {
    const a = fresh();
    await startEmpty(a.db, NOW);
    const made = await createStop(a.db, stopValues, NOW);
    if (!made.ok) throw new Error(made.reason);
    const text = await exportText(a.raw);

    const b = fresh();
    await startEmpty(b.db, NOW + 5);
    const file = await validated(b.raw, text);
    const outcome = await importBackup(b.raw, file, { backups: noBackups, now: NOW + 10 });
    expect(outcome.orphans).toEqual([]);
    expect((await counts(b.db)).network).toBe(1);
    expect((await counts(b.db)).dayType).toBe(3);
    expect(await b.db.select().from(stop).where(eq(stop.id, made.id))).toHaveLength(1);
  });

  it("importado num banco limpo sem startEmpty: a rede e os tipos de dia vêm do arquivo", async () => {
    const a = fresh();
    await startEmpty(a.db, NOW);
    const text = await exportText(a.raw);

    const b = fresh();
    const file = await validated(b.raw, text);
    const outcome = await importBackup(b.raw, file, { backups: noBackups, now: NOW + 10 });
    expect(outcome.orphans).toEqual([]);
    expect(await b.db.select().from(network)).toEqual([expect.objectContaining({ id: USER_NETWORK_ID, source: "user" })]);
    expect(await b.db.select().from(dayType)).toHaveLength(3);
    await markFirstRunDone(b.db, NOW);
    expect((await createStop(b.db, stopValues, NOW)).ok).toBe(true);
  });
});
