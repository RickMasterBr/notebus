/// <reference types="node" />
// E-04, T-41: depois de editar a hora, escolher `manual` e dar "Não sei", o backup (E-03) leva tudo. Rede inventada (D-091).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serializeBackup } from "@notebus/domain";
import { importBackup, readBackupInput } from "./backup";
import { prepareImport } from "../data/backupFlow";
import { THURSDAY, fixture, lineId, lisbon, stopId, tripIdOf } from "../data/registroFixture";
import { migrations } from "./migrations";
import type { BackupStore } from "./migrate";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const memoryBackups = (): BackupStore => ({ create: async () => {}, restore: async () => {}, list: async () => [], remove: async () => {} });

describe("T-41: exportar depois de editar, escolher e dispensar; importar num banco vazio + a rede", () => {
  it("mesmos fatos editados, manual preservado, review_dismissed_at preservado, recorded_at original intacto", async () => {
    let n = 0;
    const src = await fixture({ newId: () => `0199c3a0-0000-7000-8000-${String(++n).padStart(12, "0")}` });
    await src.raw.exec(`PRAGMA user_version = ${migrations.length}`);
    const now = lisbon(THURSDAY, "10:00");
    const board = (hhmm: string, ss = "00") => src.registro.board({ stopId: stopId("A"), lineId: lineId("1"), at: lisbon(THURSDAY, hhmm, ss) });

    // Três registros: um casado, um órfão (08:30: +18 / −12) e outro órfão (09:30: +48 / −12 não; nenhuma passagem perto).
    const edited = await board("08:12", "30");
    const chosen = await board("08:30");
    const dismissed = await board("09:30");
    await src.registro.refreshDeductions(now);

    // (1) Editar a hora do primeiro: 08:13 (era 08:12:30; o toque ficou em 08:12:30). (2) Escolher a das 08:10 para o segundo.
    // (3) "Não sei" no terceiro.
    expect((await src.registro.edit(edited.observationId, { observedAt: lisbon(THURSDAY, "08:13") }, now)).changed).toBe(true);
    expect((await src.registro.chooseManual(chosen.observationId, { tripId: tripIdOf("1", "0810"), position: 2, serviceDate: THURSDAY }, now)).ok).toBe(true);
    expect(await src.registro.dismissReview(dismissed.observationId, now)).not.toBeNull();
    const srcRows = (await src.registro.load()).observations;

    // Exportar e importar num banco novo (só a rede oficial), como no T-41.
    const text = await serializeBackup(await readBackupInput(src.raw, { now, appVersion: "1.0.0" }), sha256);
    const clean = await fixture();
    await clean.raw.exec(`PRAGMA user_version = ${migrations.length}`);
    const preview = await prepareImport(clean.raw, text, sha256);
    if (!preview.ok) throw new Error(`${preview.problem}: ${preview.detail}`);
    await clean.registro.exclusive(() => importBackup(clean.raw, preview.file, { backups: memoryBackups(), now: now + 60_000 }));
    // A fila roda depois da importação, como no app: o `manual` não se recalcula e nada do que foi gravado muda.
    await clean.registro.refreshDeductions(now + 120_000);
    const cleanRows = (await clean.registro.load()).observations;

    expect(cleanRows).toHaveLength(3);
    const pick = (rows: typeof srcRows, id: string) => rows.find((o) => o.id === id)!;
    const view = (o: (typeof srcRows)[number]) => ({
      observedAt: o.observedAt, observedEndAt: o.observedEndAt, recordedAt: o.recordedAt, mode: o.mode, kind: o.kind,
      matchStatus: o.matchStatus, tripId: o.tripId, deviationMin: o.deviationMin, reviewDismissedAt: o.reviewDismissedAt,
    });
    for (const id of [edited.observationId, chosen.observationId, dismissed.observationId]) {
      expect(view(pick(cleanRows, id))).toEqual(view(pick(srcRows, id)));
    }
    // Os valores em si: hora corrigida (08:13), toque original (08:12:30), manual +18, marca "Não sei" e órfão.
    expect(view(pick(cleanRows, edited.observationId))).toMatchObject({
      observedAt: lisbon(THURSDAY, "08:13"), recordedAt: lisbon(THURSDAY, "08:12", "30"), mode: "later", matchStatus: "auto", deviationMin: 1,
    });
    expect(view(pick(cleanRows, chosen.observationId))).toMatchObject({ matchStatus: "manual", tripId: tripIdOf("1", "0810"), deviationMin: 18 });
    expect(view(pick(cleanRows, dismissed.observationId))).toMatchObject({ matchStatus: "orphan", reviewDismissedAt: now });
  });
});
