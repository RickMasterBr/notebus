/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

export interface HomeSheetWiringCheck {
  callsHomeCardsPlan: boolean;
  noLegacyCardCondition: boolean;
  rendersOfflineCardWithShowOffline: boolean;
  checksShowAny: boolean;
  usesEffectiveHeightTwice: boolean;
  callsHomeCardsPlanWithExpectedArgs: boolean;
  singleOfferVisible: boolean;
}

export function checkHomeSheetWiring(source: string): HomeSheetWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    callsHomeCardsPlan: /\bhomeCardsPlan\s*\(/.test(clean),
    noLegacyCardCondition: !/!tripCard\s*&&\s*!reminder/.test(clean),
    rendersOfflineCardWithShowOffline: norm.includes("cards.showOffline ? <OfflineMapCard"),
    checksShowAny: norm.includes("cards.showAny ?"),
    usesEffectiveHeightTwice: (norm.match(/cards\.effectiveHeight/g) ?? []).length >= 2,
    callsHomeCardsPlanWithExpectedArgs:
      norm.includes("homeCardsPlan({") &&
      norm.includes("offerVisible: offlineMap.offerVisible") &&
      norm.includes("offlineStatus: offlineMap.status.kind") &&
      norm.includes("measuredHeight: cardHeight"),
    singleOfferVisible: (norm.match(/offlineMap\.offerVisible/g) ?? []).length === 1,
  };
}

export interface MapBackdropWiringCheck {
  callsMapShownForOffer: boolean;
}

export function checkMapBackdropWiring(source: string): MapBackdropWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    callsMapShownForOffer: norm.includes("setMapVisible(mapShownForOffer(failed, opening !== null))"),
  };
}

export interface OfflineProviderWiringCheck {
  callsCanStartOfflineDownload: boolean;
  callsApplyOfflineSnooze: boolean;
  guardsCanStartOfflineDownload: boolean;
  appliesOfflineSnoozeWithDispatchAndWrite: boolean;
  callsShouldShowReadyToast: boolean;
}

export function checkOfflineProviderWiring(source: string): OfflineProviderWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    callsCanStartOfflineDownload: /\bcanStartOfflineDownload\s*\(/.test(clean),
    callsApplyOfflineSnooze: /\bapplyOfflineSnooze\s*\(/.test(clean),
    guardsCanStartOfflineDownload: norm.includes("if (!canStartOfflineDownload(state.status)) return"),
    appliesOfflineSnoozeWithDispatchAndWrite:
      norm.includes("await applyOfflineSnooze(now(), {") &&
      /dispatch\s*:/.test(norm) &&
      /write\s*:/.test(norm),
    callsShouldShowReadyToast: norm.includes("if (shouldShowReadyToast(refreshed))"),
  };
}

export interface OfflineControllerWiringCheck {
  guardsDownloadStarted: boolean;
}

export function checkOfflineControllerWiring(source: string): OfflineControllerWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    guardsDownloadStarted:
      norm.includes('case "download_started":') &&
      norm.includes("!canStartOfflineDownload(state.status)"),
  };
}

export interface SettingsSheetWiringCheck {
  callsOfflineSettingsButtons: boolean;
  callsRunOfflineSettingsAction: boolean;
  callsOfflineSettingsButtonsStrict: boolean;
  guardsEmptyButtons: boolean;
  mapsButtons: boolean;
  callsRunOfflineSettingsActionStrict: boolean;
}

export function checkSettingsSheetWiring(source: string): SettingsSheetWiringCheck {
  const clean = stripComments(source);
  const norm = clean.replace(/\s+/g, " ");
  return {
    callsOfflineSettingsButtons: /\bofflineSettingsButtons\s*\(/.test(clean),
    callsRunOfflineSettingsAction: /\brunOfflineSettingsAction\s*\(/.test(clean),
    callsOfflineSettingsButtonsStrict: norm.includes("const buttons = offlineSettingsButtons(offlineMap.status);"),
    guardsEmptyButtons: norm.includes("if (buttons.length === 0) return"),
    mapsButtons: norm.includes("buttons.map("),
    callsRunOfflineSettingsActionStrict: norm.includes("runOfflineSettingsAction(b.action, offlineMap)"),
  };
}

describe("guarda estático de ligação de componentes offline (Item 0.6)", () => {
  it("HomeSheet.tsx liga cartões, plano e altura efetiva de forma estrita", () => {
    const file = join(__dirname, "../sheets/HomeSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkHomeSheetWiring(content);
    expect(res.callsHomeCardsPlan, "HomeSheet.tsx deve chamar homeCardsPlan(").toBe(true);
    expect(res.noLegacyCardCondition, "HomeSheet.tsx não deve conter !tripCard && !reminder").toBe(true);
    expect(res.rendersOfflineCardWithShowOffline, "HomeSheet.tsx deve ter cards.showOffline ? <OfflineMapCard").toBe(true);
    expect(res.checksShowAny, "HomeSheet.tsx deve ter cards.showAny ?").toBe(true);
    expect(res.usesEffectiveHeightTwice, "HomeSheet.tsx deve usar cards.effectiveHeight pelo menos 2 vezes").toBe(true);
    expect(res.callsHomeCardsPlanWithExpectedArgs, "HomeSheet.tsx deve chamar homeCardsPlan com os argumentos esperados").toBe(true);
    expect(res.singleOfferVisible, "HomeSheet.tsx deve conter offlineMap.offerVisible apenas uma vez").toBe(true);
  });

  it("MapBackdrop.tsx contém setMapVisible(mapShownForOffer(failed, opening !== null)) completo", () => {
    const file = join(__dirname, "../screens/MapBackdrop.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkMapBackdropWiring(content);
    expect(res.callsMapShownForOffer, "MapBackdrop.tsx deve conter setMapVisible(mapShownForOffer(failed, opening !== null))").toBe(true);
  });

  it("OfflineMapProvider.tsx chama canStartOfflineDownload, applyOfflineSnooze e shouldShowReadyToast de forma estrita", () => {
    const file = join(__dirname, "./OfflineMapProvider.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkOfflineProviderWiring(content);
    expect(res.callsCanStartOfflineDownload, "OfflineMapProvider.tsx deve chamar canStartOfflineDownload(").toBe(true);
    expect(res.callsApplyOfflineSnooze, "OfflineMapProvider.tsx deve chamar applyOfflineSnooze(").toBe(true);
    expect(res.guardsCanStartOfflineDownload, "OfflineMapProvider.tsx deve conter if (!canStartOfflineDownload(state.status)) return").toBe(true);
    expect(res.appliesOfflineSnoozeWithDispatchAndWrite, "OfflineMapProvider.tsx deve chamar applyOfflineSnooze com dispatch: e write:").toBe(true);
    expect(res.callsShouldShowReadyToast, "OfflineMapProvider.tsx deve conter if (shouldShowReadyToast(refreshed))").toBe(true);
  });

  it("offlineMapController.ts confere !canStartOfflineDownload no caso download_started", () => {
    const file = join(__dirname, "./offlineMapController.ts");
    const content = readFileSync(file, "utf8");
    const res = checkOfflineControllerWiring(content);
    expect(res.guardsDownloadStarted, "offlineMapController.ts deve conter !canStartOfflineDownload(state.status) no caso download_started").toBe(true);
  });

  it("SettingsSheet.tsx chama offlineSettingsButtons, confere botões vazios e liga runOfflineSettingsAction", () => {
    const file = join(__dirname, "../sheets/SettingsSheet.tsx");
    const content = readFileSync(file, "utf8");
    const res = checkSettingsSheetWiring(content);
    expect(res.callsOfflineSettingsButtons, "SettingsSheet.tsx deve chamar offlineSettingsButtons(").toBe(true);
    expect(res.callsRunOfflineSettingsAction, "SettingsSheet.tsx deve chamar runOfflineSettingsAction(").toBe(true);
    expect(res.callsOfflineSettingsButtonsStrict, "SettingsSheet.tsx deve conter const buttons = offlineSettingsButtons(offlineMap.status)").toBe(true);
    expect(res.guardsEmptyButtons, "SettingsSheet.tsx deve conter if (buttons.length === 0) return").toBe(true);
    expect(res.mapsButtons, "SettingsSheet.tsx deve conter buttons.map(").toBe(true);
    expect(res.callsRunOfflineSettingsActionStrict, "SettingsSheet.tsx deve conter runOfflineSettingsAction(b.action, offlineMap)").toBe(true);
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

  it("checkHomeSheetWiring falha quando cards.showOffline ? <OfflineMapCard não é usado", () => {
    const mock = `
      const cards = homeCardsPlan({ offerVisible: offlineMap.offerVisible, offlineStatus: offlineMap.status.kind, measuredHeight: cardHeight });
      {cards.showAny ? <View>{offlineMap.offerVisible ? <OfflineMapCard /> : null}</View> : null}
      const h = cards.effectiveHeight + cards.effectiveHeight;
    `;
    const res = checkHomeSheetWiring(mock);
    expect(res.rendersOfflineCardWithShowOffline).toBe(false);
  });

  it("checkHomeSheetWiring falha quando cards.effectiveHeight aparece menos de 2 vezes", () => {
    const mock = `
      const cards = homeCardsPlan({ offerVisible: offlineMap.offerVisible, offlineStatus: offlineMap.status.kind, measuredHeight: cardHeight });
      {cards.showAny ? <View>{cards.showOffline ? <OfflineMapCard /> : null}</View> : null}
      const h = cards.effectiveHeight + cardHeight;
    `;
    const res = checkHomeSheetWiring(mock);
    expect(res.usesEffectiveHeightTwice).toBe(false);
  });

  it("checkHomeSheetWiring falha quando homeCardsPlan não recebe argumentos esperados", () => {
    const mock = `
      const cards = homeCardsPlan({ offerVisible: offlineMap.offerVisible, offlineStatus: offlineMap.status.kind, measuredHeight: 0 });
      {cards.showAny ? <View>{cards.showOffline ? <OfflineMapCard /> : null}</View> : null}
      const h = cards.effectiveHeight + cards.effectiveHeight;
    `;
    const res = checkHomeSheetWiring(mock);
    expect(res.callsHomeCardsPlanWithExpectedArgs).toBe(false);
  });

  it("checkHomeSheetWiring falha quando offlineMap.offerVisible aparece mais de uma vez", () => {
    const mock = `
      const cards = homeCardsPlan({ offerVisible: offlineMap.offerVisible, offlineStatus: offlineMap.status.kind, measuredHeight: cardHeight });
      {cards.showAny ? <View>{offlineMap.offerVisible ? <OfflineMapCard /> : null}</View> : null}
      const h = cards.effectiveHeight + cards.effectiveHeight;
    `;
    const res = checkHomeSheetWiring(mock);
    expect(res.singleOfferVisible).toBe(false);
  });

  it("checkMapBackdropWiring falha quando setMapVisible(mapShownForOffer não está presente", () => {
    const mock = `setMapVisible(true);`;
    const res = checkMapBackdropWiring(mock);
    expect(res.callsMapShownForOffer).toBe(false);
  });

  it("checkMapBackdropWiring falha quando mapShownForOffer passa true no lugar de failed", () => {
    const mock = `setMapVisible(mapShownForOffer(true, opening !== null));`;
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

  it("checkOfflineProviderWiring falha quando canStartOfflineDownload não tem guarda if ... return", () => {
    const mock = `
      canStartOfflineDownload(state.status);
      await applyOfflineSnooze(now(), { dispatch: (u) => {}, write: async (u, n) => {} });
      if (shouldShowReadyToast(refreshed)) toast();
    `;
    const res = checkOfflineProviderWiring(mock);
    expect(res.guardsCanStartOfflineDownload).toBe(false);
  });

  it("checkOfflineProviderWiring falha quando applyOfflineSnooze não tem write:", () => {
    const mock = `
      if (!canStartOfflineDownload(state.status)) return;
      await applyOfflineSnooze(now(), { dispatch: (u) => {} });
      if (shouldShowReadyToast(refreshed)) toast();
    `;
    const res = checkOfflineProviderWiring(mock);
    expect(res.appliesOfflineSnoozeWithDispatchAndWrite).toBe(false);
  });

  it("checkOfflineProviderWiring falha quando shouldShowReadyToast não é chamado", () => {
    const mock = `
      if (!canStartOfflineDownload(state.status)) return;
      await applyOfflineSnooze(now(), { dispatch: (u) => {}, write: async (u, n) => {} });
      if (true) toast();
    `;
    const res = checkOfflineProviderWiring(mock);
    expect(res.callsShouldShowReadyToast).toBe(false);
  });

  it("checkOfflineControllerWiring falha quando falta !canStartOfflineDownload no download_started", () => {
    const mock = `
      case "download_started":
        return { ...state, status: { kind: "downloading", percent: 0 } };
    `;
    const res = checkOfflineControllerWiring(mock);
    expect(res.guardsDownloadStarted).toBe(false);
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

  it("checkSettingsSheetWiring falha quando falta if (buttons.length === 0) return", () => {
    const mock = `
      const buttons = offlineSettingsButtons(offlineMap.status);
      buttons.map((b) => runOfflineSettingsAction(b.action, offlineMap));
    `;
    const res = checkSettingsSheetWiring(mock);
    expect(res.guardsEmptyButtons).toBe(false);
  });

  it("checkSettingsSheetWiring falha quando runOfflineSettingsAction não recebe offlineMap", () => {
    const mock = `
      const buttons = offlineSettingsButtons(offlineMap.status);
      if (buttons.length === 0) return;
      buttons.map((b) => runOfflineSettingsAction(b.action, { startDownload: offlineMap.deleteMap, deleteMap: offlineMap.startDownload }));
    `;
    const res = checkSettingsSheetWiring(mock);
    expect(res.callsRunOfflineSettingsActionStrict).toBe(false);
  });
});
