/// <reference types="node" />
// O resultado da folha de compartilhar e o `last_export_at` (ideia 205). Dados inventados (D-091).
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LAST_EXPORT_AT, readSettingNumber } from "../db/backup";
import { backupScenario } from "../db/testing/backupScenario";
import { type ExportIO, type ShareOutcome, exportBackup } from "./backupFlow";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const at = Date.UTC(2026, 9, 25, 8, 14, 2);

function fakeIO(outcome: ShareOutcome): ExportIO {
  const files = new Map<string, string>();
  return {
    write: async (name, text) => (files.set(`file:///cache/${name}`, text), `file:///cache/${name}`),
    read: async (uri) => files.get(uri)!,
    share: async () => outcome,
  };
}

async function run(outcome: ShareOutcome) {
  const f = await backupScenario();
  const before = await readSettingNumber(f.raw, LAST_EXPORT_AT);
  const result = await exportBackup(f.raw, { now: at, appVersion: "1.0.0", sha256, io: fakeIO(outcome), newId: () => "set-last-export" });
  return { result, before, after: await readSettingNumber(f.raw, LAST_EXPORT_AT) };
}

describe("exportBackup e o resultado da folha", () => {
  it("usada: grava last_export_at", async () => {
    const { result, after } = await run("used");
    expect(result.ok).toBe(true);
    expect(after).toBe(at);
  });

  it("não dá para saber: grava last_export_at", async () => {
    const { result, after } = await run("unknown");
    expect(result.ok).toBe(true);
    expect(after).toBe(at);
  });

  it("fechada sem uso: resultado próprio e last_export_at não muda", async () => {
    const { result, before, after } = await run("dismissed");
    expect(result).toMatchObject({ ok: false, stage: "dismissed" });
    expect(after).toBe(before);
  });
});
