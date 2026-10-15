/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 15:
 * Item 0: SearchSheet passa index.status === "ready" ? index.stops.length : null ao searchEmpty.
 * Item 3: Ajustes como índice e páginas (SettingsSheet).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const searchSheet = squash(read("sheets/SearchSheet.tsx"));
const settingsSheet = squash(read("sheets/SettingsSheet.tsx"));

describe("e085Bloco15Wiring (Item 0)", () => {
  it("a SearchSheet passa index.status === 'ready' ? index.stops.length : null ao searchEmpty", () => {
    expect(searchSheet).toMatch(
      /searchEmpty\(\{[\s\S]*?stopTotal:\s*index\.status\s*===\s*"ready"\s*\?\s*index\.stops\.length\s*:\s*null/,
    );
  });
});

describe("e085Bloco15Wiring (Item 3: Ajustes como índice e páginas)", () => {
  it("cada linha do índice consome o campo certo de view e abre o destino certo", () => {
    // Meu nome: consome view.nameValue e abre page: "name"
    expect(settingsSheet).toMatch(/value=\{view\.nameValue\}[\s\S]*?page:\s*"name"/);
    // Lugares: consome view.placesValue e empilha kind: "places"
    expect(settingsSheet).toMatch(/value=\{view\.placesValue\}[\s\S]*?kind:\s*"places"/);
    // Margem: consome view.marginValue e abre page: "margin"
    expect(settingsSheet).toMatch(/value=\{view\.marginValue\}[\s\S]*?page:\s*"margin"/);
    // Tipos de dia: consome view.daysValue e abre page: "days"
    expect(settingsSheet).toMatch(/value=\{view\.daysValue\}[\s\S]*?page:\s*"days"/);
    // Feriados: consome view.holidaysValue e abre page: "holidays"
    expect(settingsSheet).toMatch(/value=\{view\.holidaysValue\}[\s\S]*?page:\s*"holidays"/);
    // Avisos ligados: consome view.alertsCount e empilha kind: "alarms"
    expect(settingsSheet).toMatch(/value=\{view\.alertsCount\}[\s\S]*?kind:\s*"alarms"/);
    // Linhas e pontos: consome view.networkName e empilha kind: "network"
    expect(settingsSheet).toMatch(/value=\{view\.networkName\}[\s\S]*?kind:\s*"network"/);
    // Linha da rede ativa: abre kind: "networkInfo"
    expect(settingsSheet).toMatch(/title=\{netLine\}[\s\S]*?kind:\s*"networkInfo"/);
    // Mapa: consome view.mapValue e abre page: "map"
    expect(settingsSheet).toMatch(/value=\{view\.mapValue\}[\s\S]*?page:\s*"map"/);
    // Backup: consome view.backupValue e abre page: "backup"
    expect(settingsSheet).toMatch(/value=\{view\.backupValue\}[\s\S]*?page:\s*"backup"/);
  });

  it("SheetHandle usa hideCloseButton fora da raiz e o toque da barra chama voltar", () => {
    expect(settingsSheet).toMatch(
      /hideCloseButton=\{!handleInfo\.showClose\}|hideCloseButton=\{page\s*!==\s*"root"\}/,
    );
    expect(settingsSheet).toMatch(
      /handleInfo\.press\s*===\s*"close"\s*\?\s*onClose\s*:\s*onBack|handleInfo\.press\s*===\s*"close"\s*\?\s*onClose\s*:\s*handleBack/,
    );
  });

  it("o botão '‹ Ajustes' existe só fora da raiz e tem o rótulo settings.back.a11y", () => {
    expect(settingsSheet).toMatch(
      /page\s*!==\s*"root"[\s\S]*?accessibilityLabel=\{t\("settings\.back\.a11y"\)\}/,
    );
  });

  it("o interruptor de avisos fica na linha e usa handleToggleAlarms", () => {
    expect(settingsSheet).toContain("useOptimisticSwitch(prefs.alarmsAllowed, handleToggleAlarms)");
    expect(settingsSheet).toMatch(/<Switch[\s\S]*?onValueChange=\{alarmsSwitch\.onValueChange\}/);
  });

  it("Salvar chama setName e Apagar nome chama clear e só aparece com nome", () => {
    expect(settingsSheet).toMatch(/handleSaveName[\s\S]*?setName\(/);
    expect(settingsSheet).toMatch(/onPress=\{handleSaveName\}/);
    expect(settingsSheet).toMatch(/handleClearName[\s\S]*?clear\(/);
    expect(settingsSheet).toMatch(/hasName\s*\?\s*\(?\s*<Pressable[\s\S]*?onPress=\{handleClearName\}/);
  });

  it("a página name mostra greetingText", () => {
    expect(settingsSheet).toContain("greetingText(");
  });

  it("a SettingsSheet não contém <CrossGlyph", () => {
    expect(settingsSheet).not.toContain("<CrossGlyph");
  });
});
