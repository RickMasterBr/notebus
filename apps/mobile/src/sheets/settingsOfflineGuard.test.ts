/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export interface SettingsOfflineGuardViolations {
  hasOfflineMapTitleKey: boolean;
}

/**
 * Analisa SettingsSheet.tsx e verifica se contém a chave do título
 * da linha de mapa sem internet ("settings.offline_map.title").
 */
export function checkSettingsOfflineGuard(source: string): SettingsOfflineGuardViolations {
  return {
    hasOfflineMapTitleKey: source.includes('"settings.offline_map.title"'),
  };
}

describe("guarda estático da linha de mapa sem internet em SettingsSheet.tsx (Item 3)", () => {
  it("SettingsSheet.tsx contém a chave 'settings.offline_map.title'", () => {
    const filePath = join(__dirname, "./SettingsSheet.tsx");
    const content = readFileSync(filePath, "utf8");
    const result = checkSettingsOfflineGuard(content);
    expect(result.hasOfflineMapTitleKey, "Falta a chave 'settings.offline_map.title' em SettingsSheet.tsx").toBe(true);
  });

  it("falha quando a chave 'settings.offline_map.title' não está presente", () => {
    const mock = `
      export function SettingsSheet() {
        return <View><ListRow title="Outra coisa" /></View>;
      }
    `;
    const result = checkSettingsOfflineGuard(mock);
    expect(result.hasOfflineMapTitleKey).toBe(false);
  });
});
