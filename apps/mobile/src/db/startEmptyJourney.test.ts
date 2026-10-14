/// <reference types="node" />
/**
 * O caminho do zero inteiro (E-08.5 bloco 7, D-201): sem importar nada, do primeiro ponto ao backup de ida e volta.
 * Dados inventados (D-091). Quinta 15/10/2026, 08:00 em Lisboa (hora de verão).
 */
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepareImport } from "../data/backupFlow";
import { createRegistro } from "../data/registro";
import { lisbon } from "../data/registroFixture";
import { matchNetworkOf } from "../data/records";
import { loadSchedule } from "../data/schedule";
import { buildStopCard } from "../data/stopCard";
import { importBackup, readBackupInput } from "./backup";
import { createLine } from "./lineCreate";
import type { ImportDb } from "./importMobilis";
import type { BackupStore } from "./migrate";
import { observation } from "./schema";
import { startEmpty } from "./startEmpty";
import { createStop } from "./stopCreate";
import { testDbWithSqlite } from "./testing/drizzleTestDb";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const NOW = lisbon("2026-10-15", "08:00");
const noBackups: BackupStore = { create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} };
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

describe("começar do zero, do primeiro ponto ao backup", () => {
  it("ponto, linha, cartão, registro casado e backup de ida e volta", async () => {
    const { db, raw } = fresh();

    // 1. Banco limpo → startEmpty.
    await startEmpty(db, NOW);

    // 2. Dois pontos.
    const home = await createStop(db, stopValues("Meu ponto"), NOW);
    const uni = await createStop(db, stopValues("Faculdade"), NOW + 1);
    if (!home.ok || !uni.ok) throw new Error(`passo 2: createStop recusou (${!home.ok ? home.reason : !uni.ok ? uni.reason : ""})`);

    // 3. Uma linha com duas saídas.
    const made = await createLine(
      db,
      {
        code: "7",
        name: "Linha do Rick",
        color: "#1A73E8",
        pattern: { label: "sentido Faculdade", stopIds: [home.id, uni.id] },
        durationMinutes: 20,
        dayTypeCodes: ["weekday"],
        departures: [{ hour: 8, minute: 10 }, { hour: 8, minute: 40 }],
      },
      NOW + 2,
    );
    if (!made.ok) throw new Error(`passo 3: createLine recusou (${made.reason})`);
    expect(made.tripCount, "passo 3: 2 viagens").toBe(2);

    // 4. O cartão do ponto mostra a próxima às 08:10 (antes do registro).
    const data = await loadSchedule(db);
    const card = buildStopCard(home.id, data, NOW);
    const line7 = card?.lines.find((l) => l.code === "7");
    expect(line7?.state, "passo 4: próxima da linha 7").toMatchObject({ status: "next", time: "08:10", rangeStart: "08:08", rangeEnd: "08:12", beAtStop: "08:06" });

    // 5. Embarque às 08:12 → dedução casa a viagem das 08:10, desvio 2.
    const registro = createRegistro(db, { network: () => matchNetworkOf(data), snapshot: () => data });
    const token = await registro.board({ stopId: home.id, lineId: made.lineId, at: lisbon("2026-10-15", "08:12") });
    await registro.refreshDeductions(NOW + 600_000);
    const [obs] = await db.select().from(observation).where(eq(observation.id, token.observationId));
    expect([obs?.matchStatus, obs?.deviationMin], "passo 5: casou automático com desvio 2").toEqual(["auto", 2]);

    // 6. Backup de ida e volta: o registro chega ao outro banco.
    const text = await serializeBackup(await readBackupInput(raw, { now: NOW, appVersion: "1.0.0" }), sha256);
    const other = fresh();
    await startEmpty(other.db, NOW + 5);
    const preview = await prepareImport(other.raw, text, sha256);
    if (!preview.ok) throw new Error(`passo 6: ${preview.problem}: ${preview.detail}`);
    const outcome = await importBackup(other.raw, preview.file, { backups: noBackups, now: NOW + 10 });
    expect(outcome.orphans, "passo 6: sem órfãos").toEqual([]);
    const [arrived] = await other.db.select().from(observation).where(eq(observation.id, token.observationId));
    expect(arrived?.kind, "passo 6: o registro chegou").toBe("boarded");
  });
});
