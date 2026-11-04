/// <reference types="node" />
/**
 * Guarda estático da fiação de "Importar rede nova" (ideia 249).
 * GUARDA DE TEXTO: confere o código-fonte, não o efeito em tela montada (toque e seletor: só o iPhone).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8").replace(/\r\n/g, "\n");

const provider = read("data/NetworkImportProvider.tsx");
const settingsSheet = read("sheets/SettingsSheet.tsx");
const app = readFileSync(join(__dirname, "..", "..", "App.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("networkImportWiring", () => {
  it("o confirm recarrega o horário, reagenda os avisos e atualiza os registros", () => {
    expect(provider).toMatch(/await reloadSchedule\(\)/);
    expect(provider).toMatch(/requestReschedule\(\)/);
    expect(provider).toMatch(/await refresh\(\)/);
  });

  it("aplicar e desfazer passam pela fila exclusive", () => {
    expect(provider).toMatch(/exclusive\(\(\) => applyNetworkImport\(/);
    expect(provider).toMatch(/exclusive\(\(\) => undoNetworkImport\(/);
  });

  it("o provider não lê o relógio direto", () => {
    expect(provider).not.toMatch(/Date\.now\(|new Date\(/);
  });

  it("Dados tem o item que abre o seletor e a página com Importar e Cancelar", () => {
    expect(settingsSheet).toMatch(/networkImport\.start\(\)/);
    expect(settingsSheet).toMatch(/page: "network_import"/);
    expect(settingsSheet).toMatch(/networkImport\.confirm\(\)/);
    expect(settingsSheet).toMatch(/networkImport\.cancel\(\)/);
  });

  it("o provider é montado em App.tsx dentro do BackupProvider", () => {
    const open = app.indexOf("<BackupProvider");
    const inner = app.indexOf("<NetworkImportProvider");
    expect(open).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(open);
    expect(inner).toBeLessThan(app.indexOf("</BackupProvider>"));
  });

  it("os textos do §7.1 estão no catálogo", () => {
    for (const key of [
      "settings.network_import",
      "settings.network_import.hint",
      "settings.network_import.summary",
      "settings.network_import.already",
      "settings.network_import.invalid",
      "settings.network_import.confirm",
      "settings.network_import.cancel",
      "toast.network_import_done.title",
      "toast.network_import_failed.title",
      "toast.network_import_failed.body",
      "toast.network_import_undone.title",
    ]) {
      expect(ptBR, key).toHaveProperty([key]);
    }
  });
});
