/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAG_STRIP_EVENT_COUNT, isDiagEnabled } from "./diagLog";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

export interface SheetHostDiagCheck {
  callsHomeLayerPointerEvents: boolean;
  homeLayerUsesDynamicPointerEvents: boolean;
}

export function checkSheetHostWiring(source: string): SheetHostDiagCheck {
  const norm = normalize(source);

  const callsHomeLayerPointerEvents =
    norm.includes("homeLayerPointerEvents(stacked.length)");

  // A primeira View (camada Home) usa pointerEvents={homeLayerPointerEvents(stacked.length)} e envolve a Home
  const homeLayerUsesDynamicPointerEvents =
    /<View\b[^>]*pointerEvents=\{homeLayerPointerEvents\(stacked\.length\)\}[^>]*>\s*\{customBase \?\? <HomeSheet \/>\}/.test(
      norm,
    );

  return {
    callsHomeLayerPointerEvents,
    homeLayerUsesDynamicPointerEvents,
  };
}

export interface DiagScrollWiringCheck {
  diagScrollDisabled: boolean;
  usesSyncExternalStore: boolean;
  callsDiagStripLines: boolean;
  stripPassesSnapshotPicker: boolean;
  textHasNumberOfLines1: boolean;
  stripUsesTopInsetWithoutBottom: boolean;
  recordDiagEventCallsStoreRecord: boolean;
  hooksInOrder: boolean;
  diagStoreCapacity60: boolean;
}

export function checkDiagScrollWiring(source: string): DiagScrollWiringCheck {
  const norm = normalize(source);

  const diagScrollDisabled =
    /export\s+const\s+DIAG_SCROLL\s*=\s*isDiagEnabled\(\s*process\.env\.EXPO_PUBLIC_NOTEBUS_DIAG\s*\);/.test(
      norm,
    );

  const usesSyncExternalStore = norm.includes(
    "useSyncExternalStore(diagStore.subscribe, diagStore.getSnapshot)",
  );

  const diagStoreCapacity60 = /const\s+diagStore\s*=\s*createDiagStore\(60\)/.test(norm);

  const callsDiagStripLines = norm.includes("diagStripLines(");

  const stripPassesSnapshotPicker = /picker:\s*snapshot\.picker\b/.test(norm);

  const textHasNumberOfLines1 =
    /lines\.map\([^)]*\)\s*=>\s*\(\s*<Text\b[^>]*numberOfLines=\{1\}/.test(norm);

  const stripUsesTopInsetWithoutBottom =
    /top:\s*insets\.top\b/.test(norm) &&
    !/bottom:\s*insets\.bottom\b/.test(norm) &&
    !/strip:\s*\{[^}]*bottom:/.test(norm);

  const recordDiagEventCallsStoreRecord =
    /function\s+recordDiagEvent\s*\([^)]*\)\s*\{[^}]*diagStore\.record\(/.test(norm);

  const hasStackDiagStripBody =
    /function\s+StackDiagStrip\s*\(\)\s*\{\s*if\s*\(!DIAG_SCROLL\)\s*return\s*null;\s*return\s*<StackDiagStripBody\s*\/>;\s*\}/.test(
      norm,
    );
  const syncStoreIdx = norm.indexOf("useSyncExternalStore(");
  const bodyIdx = norm.indexOf("function StackDiagStripBody");
  const hooksInOrder =
    hasStackDiagStripBody && bodyIdx !== -1 && syncStoreIdx > bodyIdx;

  return {
    diagScrollDisabled,
    usesSyncExternalStore,
    callsDiagStripLines,
    stripPassesSnapshotPicker,
    textHasNumberOfLines1,
    stripUsesTopInsetWithoutBottom,
    recordDiagEventCallsStoreRecord,
    hooksInOrder,
    diagStoreCapacity60,
  };
}

export interface SheetsContextWiringCheck {
  closeActionRecordsRequestWithTwoArgs: boolean;
  closeActionDoesNotPassNowRef: boolean;
}

export function checkSheetsContextWiring(source: string): SheetsContextWiringCheck {
  const norm = normalize(source);

  const closeActionRecordsRequestWithTwoArgs =
    /if\s*\(\s*DIAG_SCROLL\s*&&\s*action\.type\s*===\s*["']close["']\s*\)\s*\{[^}]*recordCloseRequest\(\s*action\.id\s*,\s*closing\s*\?\s*closing\.kind\s*:\s*["']desconhecido["']\s*\)/.test(
      norm,
    );

  const closeActionDoesNotPassNowRef = !/recordCloseRequest\([^)]*nowRef/.test(norm);

  return {
    closeActionRecordsRequestWithTwoArgs,
    closeActionDoesNotPassNowRef,
  };
}

export interface MapPickerWiringCheck {
  recordsSelectorOpened: boolean;
  recordsSelectorClosedInCleanup: boolean;
}

export function checkMapPickerWiring(source: string): MapPickerWiringCheck {
  const norm = normalize(source);

  const recordsSelectorOpened = norm.includes("recordDiagEvent(SELECTOR_OPENED)");

  const recordsSelectorClosedInCleanup =
    /return\s*\(\)\s*=>\s*\{[^}]*recordDiagEvent\(SELECTOR_CLOSED\)/.test(norm);

  return {
    recordsSelectorOpened,
    recordsSelectorClosedInCleanup,
  };
}

export interface StackedSheetDiagCheck {
  mountRecordsWithDiag: boolean;
  unmountRecordsInCleanupWithDiag: boolean;
  onAnimateRecordsWithDiag: boolean;
  popRecordsCloseWithDiag: boolean;
  bottomSheetHasOnAnimate: boolean;
  allRecordCallsGuardedByDiag: boolean;
}

export function checkStackedSheetDiagWiring(source: string): StackedSheetDiagCheck {
  const norm = normalize(source);

  const mountRecordsWithDiag =
    /useEffect\(\(\)\s*=>\s*\{[^}]*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`montou #\$\{id\}`\)/.test(
      norm,
    );

  const unmountRecordsInCleanupWithDiag =
    /return\s*\(\)\s*=>\s*\{[^}]*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`desmontou #\$\{id\}`\)/.test(
      norm,
    );

  const onAnimateRecordsWithDiag =
    /const\s+handleAnimate\s*=\s*useCallback\([^)]*\)\s*=>\s*\{[^}]*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`anim #\$\{id\} \$\{fromIndex\}→\$\{toIndex\}`\)/.test(
      norm,
    );

  const bottomSheetHasOnAnimate = /<BottomSheet\b[^>]*onAnimate=\{handleAnimate\}/.test(norm);

  const popMatch = norm.match(
    /const\s+pop\s*=\s*useCallback\(\(\)\s*=>\s*\{([\s\S]*?)dispatch\(\s*\{\s*type:\s*["']close["'],\s*id\s*\}\s*\);/,
  );
  const popRecordsCloseWithDiag =
    popMatch !== null &&
    /if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`fechou #\$\{id\}`\);?\s*if\s*\(!isTopRef\.current\)/.test(
      popMatch[1]!,
    );

  const allRecordCalls = [...norm.matchAll(/(.{0,30})recordDiagEvent\(/g)];
  const allRecordCallsGuardedByDiag =
    allRecordCalls.length > 0 &&
    allRecordCalls.every((m) => /if\s*\(\s*DIAG_SCROLL\s*\)\s*$/.test(m[1] ?? ""));

  return {
    mountRecordsWithDiag,
    unmountRecordsInCleanupWithDiag,
    onAnimateRecordsWithDiag,
    popRecordsCloseWithDiag,
    bottomSheetHasOnAnimate,
    allRecordCallsGuardedByDiag,
  };
}

export function checkSettingsSheetDiagWiring(source: string): { pageChangeRecordsWithDiag: boolean } {
  const norm = normalize(source);
  const pageChangeRecordsWithDiag =
    /if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`ajustes: pagina \$\{prev\} → \$\{page\}`\)/.test(
      norm,
    );
  return { pageChangeRecordsWithDiag };
}

describe("guarda estático de diagnóstico (Item 3)", () => {
  const sheetHostPath = join(__dirname, "SheetHost.tsx");
  const sheetHostSource = readFileSync(sheetHostPath, "utf8");

  const diagScrollPath = join(__dirname, "diagScroll.tsx");
  const diagScrollSource = readFileSync(diagScrollPath, "utf8");

  const sheetsContextPath = join(__dirname, "SheetsContext.tsx");
  const sheetsContextSource = readFileSync(sheetsContextPath, "utf8");

  const mapPickerPath = join(__dirname, "../screens/MapPicker.tsx");
  const mapPickerSource = readFileSync(mapPickerPath, "utf8");

  const stackedSheetPath = join(__dirname, "StackedSheet.tsx");
  const stackedSheetSource = readFileSync(stackedSheetPath, "utf8");

  const settingsSheetPath = join(__dirname, "SettingsSheet.tsx");
  const settingsSheetSource = readFileSync(settingsSheetPath, "utf8");

  it("(1) SheetHost.tsx usa homeLayerPointerEvents(stacked.length) no pointerEvents da primeira View", () => {
    const checks = checkSheetHostWiring(sheetHostSource);
    expect(checks.callsHomeLayerPointerEvents).toBe(true);
    expect(checks.homeLayerUsesDynamicPointerEvents).toBe(true);
  });

  it("(2) diagScroll.tsx usa armazém reativo, diagStripLines, top: insets.top sem bottom e hooks na ordem", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.usesSyncExternalStore).toBe(true);
    expect(checks.callsDiagStripLines).toBe(true);
    expect(checks.stripPassesSnapshotPicker).toBe(true);
    expect(checks.textHasNumberOfLines1).toBe(true);
    expect(checks.stripUsesTopInsetWithoutBottom).toBe(true);
    expect(checks.recordDiagEventCallsStoreRecord).toBe(true);
    expect(checks.hooksInOrder).toBe(true);
  });

  it("(3) DIAG_SCROLL vem de EXPO_PUBLIC_NOTEBUS_DIAG e é desligado por padrão (sem a variável)", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.diagScrollDisabled).toBe(true);
    expect(isDiagEnabled(undefined)).toBe(false);
  });

  it("(4) SheetsContext.tsx registra fechar com dois argumentos e sem nowRef", () => {
    const checks = checkSheetsContextWiring(sheetsContextSource);
    expect(checks.closeActionRecordsRequestWithTwoArgs).toBe(true);
    expect(checks.closeActionDoesNotPassNowRef).toBe(true);
  });

  it("(5) MapPicker.tsx registra SELECTOR_OPENED e SELECTOR_CLOSED na limpeza", () => {
    const checks = checkMapPickerWiring(mapPickerSource);
    expect(checks.recordsSelectorOpened).toBe(true);
    expect(checks.recordsSelectorClosedInCleanup).toBe(true);
  });

  it("(6) diagScroll.tsx cria armazém com capacidade 60 e constante da faixa é 6", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.diagStoreCapacity60).toBe(true);
    expect(DIAG_STRIP_EVENT_COUNT).toBe(6);
  });

  it("(7) StackedSheet.tsx registra montou, desmontou na limpeza, anim no onAnimate e fechou antes de pop, todos dentro de if (DIAG_SCROLL)", () => {
    const checks = checkStackedSheetDiagWiring(stackedSheetSource);
    expect(checks.mountRecordsWithDiag).toBe(true);
    expect(checks.unmountRecordsInCleanupWithDiag).toBe(true);
    expect(checks.onAnimateRecordsWithDiag).toBe(true);
    expect(checks.bottomSheetHasOnAnimate).toBe(true);
    expect(checks.popRecordsCloseWithDiag).toBe(true);
    expect(checks.allRecordCallsGuardedByDiag).toBe(true);
  });

  it("(8) SettingsSheet.tsx registra ajustes: pagina X → Y quando page muda dentro de if (DIAG_SCROLL)", () => {
    const checks = checkSettingsSheetDiagWiring(settingsSheetSource);
    expect(checks.pageChangeRecordsWithDiag).toBe(true);
  });
});
