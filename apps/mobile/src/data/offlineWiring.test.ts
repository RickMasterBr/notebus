/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export interface HomeSheetWiringCheck {
  callsHomeCardsPlan: boolean;
  noLegacyCardCondition: boolean;
}

export function checkHomeSheetWiring(source: string): HomeSheetWiringCheck {
  const clean = stripComments(source);
  return {
    callsHomeCardsPlan: /\bhomeCardsPlan\s*\(/.test(clean),
    noLegacyCardCondition: !/!tripCard\s*&&\s*!reminder/.test(clean),
  };
}

export interface MapBackdropWiringCheck {
  callsMapShownForOffer: boolean;
}

export function checkMapBackdropWiring(source: string): MapBackdropWiringCheck {
  const clean = stripComments(source);
  return {
    callsMapShownForOffer: /setMapVisible\s*\(\s*mapShownForOffer\s*\(/.test(clean),
  };
}

export interface OfflineProviderWiringCheck {
  callsCanStartOfflineDownload: boolean;
  callsApplyOfflineSnooze: boolean;
}

export function checkOfflineProviderWiring(source: string): OfflineProviderWiringCheck {
  const clean = stripComments(source);
  return {
    callsCanStartOfflineDownload: /\bcanStartOfflineDownload\s*\(/.test(clean),
    callsApplyOfflineSnooze: /\bapplyOfflineSnooze\s*\(/.test(clean),
  };
}

export interface SettingsSheetWiringCheck {
  callsOfflineSettingsButtons: boolean;
  callsRunOfflineSettingsAction: boolean;
}

export function checkSettingsSheetWiring(source: string): SettingsSheetWiringCheck {
  const clean = stripComments(source);
  return {
    callsOfflineSettingsButtons: /\bofflineSettingsButtons\s*\(/.test(clean),
    callsRunOfflineSettingsAction: /\brunOfflineSettingsAction\s*\(/.test(clean),
  };
}

describe("guarda estático de ligação de componentes offline (Item 0.6)", () => {
  it("HomeSheet.tsx chama homeCardsPlan( e não contém !tripCard && !reminder", () => {
    const file = join(__dirname, "../sheets/HomeSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkHomeSheetWiring(content);
    expect(res.callsHomeCardsPlan, "HomeSheet.tsx deve chamar homeCardsPlan(").toBe(true);
    expect(res.noLegacyCardCondition, "HomeSheet.tsx não deve conter !tripCard && !reminder").toBe(true);
  });

  it("MapBackdrop.tsx contém setMapVisible(mapShownForOffer(", () => {
    const file = join(__dirname, "../screens/MapBackdrop.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkMapBackdropWiring(content);
    expect(res.callsMapShownForOffer, "MapBackdrop.tsx deve conter setMapVisible(mapShownForOffer(").toBe(true);
  });

  it("OfflineMapProvider.tsx chama canStartOfflineDownload( e applyOfflineSnooze(", () => {
    const file = join(__dirname, "./OfflineMapProvider.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkOfflineProviderWiring(content);
    expect(res.callsCanStartOfflineDownload, "OfflineMapProvider.tsx deve chamar canStartOfflineDownload(").toBe(true);
    expect(res.callsApplyOfflineSnooze, "OfflineMapProvider.tsx deve chamar applyOfflineSnooze(").toBe(true);
  });

  it("SettingsSheet.tsx chama offlineSettingsButtons( e runOfflineSettingsAction(", () => {
    const file = join(__dirname, "../sheets/SettingsSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkSettingsSheetWiring(content);
    expect(res.callsOfflineSettingsButtons, "SettingsSheet.tsx deve chamar offlineSettingsButtons(").toBe(true);
    expect(res.callsRunOfflineSettingsAction, "SettingsSheet.tsx deve chamar runOfflineSettingsAction(").toBe(true);
  });
});

describe("testes de falha das verificações em texto de exemplo", () => {
  it("checkHomeSheetWiring falha quando homeCardsPlan não é chamado", () => {
    const mock = `const showOfflineCard = !tripCard && !reminder;`;
    const res = checkHomeSheetWiring(mock);
    expect(res.callsHomeCardsPlan).toBe(false);
  });

  it("checkHomeSheetWiring falha quando contém !tripCard && !reminder", () => {
    const mock = `
      const cards = homeCardsPlan(input);
      const legacy = !tripCard && !reminder;
    `;
    const res = checkHomeSheetWiring(mock);
    expect(res.noLegacyCardCondition).toBe(false);
  });

  it("checkMapBackdropWiring falha quando setMapVisible(mapShownForOffer não está presente", () => {
    const mock = `setMapVisible(true);`;
    const res = checkMapBackdropWiring(mock);
    expect(res.callsMapShownForOffer).toBe(false);
  });

  it("checkOfflineProviderWiring falha quando falta canStartOfflineDownload", () => {
    const mock = `await applyOfflineSnooze(now(), deps);`;
    const res = checkOfflineProviderWiring(mock);
    expect(res.callsCanStartOfflineDownload).toBe(false);
    expect(res.callsApplyOfflineSnooze).toBe(true);
  });

  it("checkOfflineProviderWiring falha quando falta applyOfflineSnooze", () => {
    const mock = `if (!canStartOfflineDownload(status)) return;`;
    const res = checkOfflineProviderWiring(mock);
    expect(res.callsCanStartOfflineDownload).toBe(true);
    expect(res.callsApplyOfflineSnooze).toBe(false);
  });

  it("checkSettingsSheetWiring falha quando falta offlineSettingsButtons", () => {
    const mock = `runOfflineSettingsAction(action, handlers);`;
    const res = checkSettingsSheetWiring(mock);
    expect(res.callsOfflineSettingsButtons).toBe(false);
    expect(res.callsRunOfflineSettingsAction).toBe(true);
  });

  it("checkSettingsSheetWiring falha quando falta runOfflineSettingsAction", () => {
    const mock = `const buttons = offlineSettingsButtons(status);`;
    const res = checkSettingsSheetWiring(mock);
    expect(res.callsOfflineSettingsButtons).toBe(true);
    expect(res.callsRunOfflineSettingsAction).toBe(false);
  });
});
