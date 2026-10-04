/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf, type Fixture } from "../data/registroFixture";
import { createHash } from "node:crypto";
import { serializeBackup } from "@notebus/domain";
import { importBackup, readBackupInput, undoImport } from "./backup";
import { prepareImport } from "../data/backupFlow";
import type { BackupStore } from "./migrate";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function memoryBackups(): BackupStore {
  const names: string[] = [];
  return {
    create: async (name) => void names.push(name),
    restore: async () => {},
    list: async () => [...names],
    remove: async (name) => void names.splice(names.indexOf(name), 1),
  };
}

const all = (f: Fixture, sql: string, params: (string | number | null)[] = []) =>
  f.raw.all(sql, params) as Record<string, unknown>[];

function snapshot(f: Fixture) {
  const tables = ["observation", "ride", "place", "walk_time", "setting"] as const;
  const snap: Record<string, unknown[]> = {};
  for (const t of tables) {
    snap[t] = all(f, `SELECT * FROM \`${t}\` ORDER BY id`);
  }
  return snap;
}

async function exportText(f: Fixture, now: number): Promise<string> {
  return serializeBackup(await readBackupInput(f.raw, { now, appVersion: "1.0.0" }), sha256);
}

async function importText(f: Fixture, text: string, now: number) {
  const preview = await prepareImport(f.raw, text, sha256);
  if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
  const outcome = await f.registro.exclusive(() =>
    importBackup(f.raw, preview.file, { backups: memoryBackups(), now }),
  );
  return { preview, outcome };
}

describe("E-03: teste de integração de ponta a ponta", () => {
  it("registrar embarque → Desci aqui → exportar → importar em banco limpo → comparar → Desfazer", async () => {
    let n = 0;
    const src = await fixture({ newId: () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}` });
    await src.raw.exec(`PRAGMA user_version = ${migrations.length}`);

    // 1. Registrar embarque na Arrabalde às 08:12:30 (viagem das 08:10 da Linha 1)
    const tBoard = lisbon(THURSDAY, "08:12", "30");
    const b1 = await src.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: tBoard });
    await src.registro.refreshDeductions(tBoard);

    // 2. Registrar "Desci aqui" no Campus às 08:45
    const tAlight = lisbon(THURSDAY, "08:45", "00");
    const trip = src.data.trips.find((t) => t.id === tripIdOf("1", "0810"))!;
    const down = await src.registro.alight({
      rideId: b1.rideId,
      stopId: stopId("K"),
      patternId: trip.patternId,
      position: 5,
      at: tAlight,
    });
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    await src.registro.refreshDeductions(tAlight);

    // Confere estado do banco de origem antes de exportar: ride fechado, deduções feitas
    const srcLoad = await src.registro.load();
    expect(srcLoad.observations).toHaveLength(2); // embarque + descida
    expect(srcLoad.rides).toHaveLength(1);
    const srcRide = srcLoad.rides[0]!;
    expect(srcRide.status).toBe("closed");
    expect(srcRide.alightingObservationId).toBe(down.token.observationId);
    expect(srcRide.tripId).toBe(trip.id);

    // 3. Exportar backup
    const tExport = tAlight + 60_000;
    const backupText = await exportText(src, tExport);
    expect(backupText).toContain('"format": "notebus-backup"');

    // 4. Abrir um banco LIMPO só com a rede oficial
    const clean = await fixture();
    await clean.raw.exec(`PRAGMA user_version = ${migrations.length}`);
    const cleanLoadBefore = await clean.registro.load();
    expect(cleanLoadBefore.observations).toHaveLength(0);
    expect(cleanLoadBefore.rides).toHaveLength(0);
    const cleanSnapshotBefore = snapshot(clean);

    // 5. Importar o backup no banco limpo
    const tImport = tExport + 60_000;
    const { preview, outcome } = await importText(clean, backupText, tImport);
    expect(preview.ok).toBe(true);
    expect(outcome.summary.inserted).toBeGreaterThanOrEqual(2);

    // 6. Recalcular deduções
    await clean.registro.refreshDeductions(tImport + 60_000);

    // 7. Comparar: mesmos ids, mesmas deduções, mesmo ride fechado
    const cleanLoadAfter = await clean.registro.load();
    expect(cleanLoadAfter.observations).toHaveLength(2);
    expect(cleanLoadAfter.rides).toHaveLength(1);

    const cleanRide = cleanLoadAfter.rides[0]!;
    expect(cleanRide.id).toBe(srcRide.id);
    expect(cleanRide.status).toBe("closed");
    expect(cleanRide.tripId).toBe(srcRide.tripId);
    expect(cleanRide.boardingObservationId).toBe(srcRide.boardingObservationId);
    expect(cleanRide.alightingObservationId).toBe(srcRide.alightingObservationId);

    const srcBoardObs = srcLoad.observations.find((o) => o.id === b1.observationId)!;
    const cleanBoardObs = cleanLoadAfter.observations.find((o) => o.id === b1.observationId)!;
    expect(cleanBoardObs.id).toBe(srcBoardObs.id);
    expect(cleanBoardObs.tripId).toBe(srcBoardObs.tripId);
    expect(cleanBoardObs.matchStatus).toBe(srcBoardObs.matchStatus);
    expect(cleanBoardObs.deviationMin).toBe(srcBoardObs.deviationMin);
    expect(cleanBoardObs.serviceDate).toBe(srcBoardObs.serviceDate);
    expect(cleanBoardObs.serviceMinute).toBe(srcBoardObs.serviceMinute);

    const srcAlightObs = srcLoad.observations.find((o) => o.id === down.token.observationId)!;
    const cleanAlightObs = cleanLoadAfter.observations.find((o) => o.id === down.token.observationId)!;
    expect(cleanAlightObs.id).toBe(srcAlightObs.id);
    expect(cleanAlightObs.kind).toBe("alighted");

    // 8. Desfazer: confere que o banco limpo volta ao estado de antes da importação
    await clean.registro.exclusive(() => undoImport(clean.raw, outcome.undo));
    const cleanSnapshotAfterUndo = snapshot(clean);
    expect(cleanSnapshotAfterUndo).toEqual(cleanSnapshotBefore);

    const cleanLoadAfterUndo = await clean.registro.load();
    expect(cleanLoadAfterUndo.observations).toHaveLength(0);
    expect(cleanLoadAfterUndo.rides).toHaveLength(0);
  });
});
