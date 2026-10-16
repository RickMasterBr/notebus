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

  it("(6) diagScroll.tsx cria armazém com capacidade 60 e constante da faixa é 12", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.diagStoreCapacity60).toBe(true);
    expect(DIAG_STRIP_EVENT_COUNT).toBe(12);
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

  it("(9) StackedSheet.tsx (v3) registra topo sobre isTop, indice em todo onChange chamando handleChange com filtro index >= 0, e mantém reabrir/coberta fechou", () => {
    const norm = normalize(stackedSheetSource);
    // Efeito sobre isTop registrando topo #id sim|nao
    expect(
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`topo #\$\{id\} \$\{isTop \? ["']sim["'] : ["']nao["']\}`\);\s*\},\s*\[isTop,\s*id\]\)/.test(norm) ||
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`topo #\$\{id\} \$\{isTop \? ["']sim["'] : ["']nao["']\}`\);\s*\},\s*\[isTop\]\)/.test(norm),
    ).toBe(true);
    // handleChange intacto com index >= 0
    expect(
      /const\s+handleChange\s*=\s*useCallback\(\(index:\s*number\)\s*=>\s*\{\s*if\s*\(\s*index\s*>=\s*0\s*\)\s*onChange\?\.\(index\);\s*\},\s*\[onChange\]\)/.test(norm),
    ).toBe(true);
    // Invólucro de onChange registra indice #id N e chama handleChange se detents
    expect(
      /const\s+handleSheetChange\s*=\s*useCallback\(\(index:\s*number\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`indice #\$\{id\} \$\{index\}`\);\s*if\s*\(\s*detents\s*\)\s*handleChange\(index\);\s*\},\s*\[id,\s*detents,\s*handleChange\]\)/.test(norm),
    ).toBe(true);
    expect(/<BottomSheet\b[^>]*onChange=\{DIAG_SCROLL \? handleSheetChange : detents \? handleChange : undefined\}/.test(norm)).toBe(true);
    // reabrir e coberta fechou continuam
    expect(norm.includes("if (DIAG_SCROLL) recordDiagEvent(`coberta fechou #${id}`)")).toBe(true);
    expect(norm.includes("if (DIAG_SCROLL) recordDiagEvent(`reabrir #${id}`)")).toBe(true);
  });

  it("(10) HomeSheet.tsx (v3) registra frase, phraseHeight, detent, small e anim todos dentro de if (DIAG_SCROLL) e com dependências primitivas", () => {
    const homeSheetPath = join(__dirname, "HomeSheet.tsx");
    const norm = normalize(readFileSync(homeSheetPath, "utf8"));

    // Todos os recordDiagEvent da HomeSheet protegidos por if (DIAG_SCROLL)
    const allRecordCalls = [...norm.matchAll(/(.{0,30})recordDiagEvent\(/g)];
    expect(allRecordCalls.length).toBeGreaterThanOrEqual(5);
    expect(allRecordCalls.every((m) => /if\s*\(\s*DIAG_SCROLL\s*\)\s*$/.test(m[1] ?? ""))).toBe(true);

    // 1. home frase mostrar|ocultar quando showPhrase muda
    expect(
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`home frase \$\{showPhrase \? ["']mostrar["'] : ["']ocultar["']\}`\);\s*\},\s*\[showPhrase\]\)/.test(norm),
    ).toBe(true);

    // 2. home phraseHeight A→B quando phraseHeight muda (dependência primitiva [phraseHeight])
    expect(
      /useEffect\(\(\)\s*=>\s*\{\s*const\s+prev\s*=\s*prevPhraseHeightRef\.current;\s*if\s*\(\s*prev\s*!==\s*phraseHeight\s*\)\s*\{\s*prevPhraseHeightRef\.current\s*=\s*phraseHeight;\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`home phraseHeight \$\{prev\}→\$\{phraseHeight\}`\);\s*\}\s*\},\s*\[phraseHeight\]\)/.test(norm),
    ).toBe(true);

    // 3. home detent A→B quando state.detent muda (dependência primitiva [state.detent])
    expect(
      /useEffect\(\(\)\s*=>\s*\{\s*const\s+prev\s*=\s*prevDetentRef\.current;\s*if\s*\(\s*prev\s*!==\s*state\.detent\s*\)\s*\{\s*prevDetentRef\.current\s*=\s*state\.detent;\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`home detent \$\{prev\}→\$\{state\.detent\}`\);\s*\}\s*\},\s*\[state\.detent\]\)/.test(norm),
    ).toBe(true);

    // 4. home small=N quando small muda (primeiro valor e mudanças, dependência primitiva [small])
    expect(
      /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`home small=\$\{small\}`\);\s*\},\s*\[small\]\)/.test(norm),
    ).toBe(true);

    // 5. home anim A→B no onAnimate do BottomSheet da Início
    expect(
      /const\s+onAnimate\s*=\s*useCallback\(\(fromIndex:\s*number,\s*toIndex:\s*number\)\s*=>\s*\{\s*if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`home anim \$\{fromIndex\}→\$\{toIndex\}`\);\s*\},\s*\[\]\)/.test(norm),
    ).toBe(true);
    expect(/<BottomSheet\b[^>]*onAnimate=\{onAnimate\}/.test(norm)).toBe(true);
  });

  it("(11) diagScroll.tsx usa useWindowDimensions e limita a faixa a 45% da altura da tela", () => {
    const norm = normalize(diagScrollSource);
    expect(norm.includes("useWindowDimensions()")).toBe(true);
    expect(/windowHeight:\s*window\.height\b/.test(norm)).toBe(true);
    expect(/maxHeight:\s*Math\.floor\(window\.height\s*\*\s*0\.45\)/.test(norm)).toBe(true);
  });

  it("(12) StackedSheet.tsx e SheetsContext.tsx registram close() #id, snap #id e dispatch de pilha dentro de if (DIAG_SCROLL)", () => {
    const stackedNorm = normalize(readFileSync(stackedSheetPath, "utf8"));
    const sheetsNorm = normalize(readFileSync(sheetsContextPath, "utf8"));

    // close() #id em closeFromHandle dentro de if (DIAG_SCROLL) com id dinâmico
    expect(
      /const\s+closeFromHandle\s*=\s*useCallback\([^)]*\)\s*=>\s*\{[\s\S]*?if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`close\(\) #\$\{id\}`\);\s*ref\.current\?\.close\(closeConfig\);/.test(
        stackedNorm,
      ),
    ).toBe(true);

    // snap #id N em reabrir dentro de if (DIAG_SCROLL)
    expect(
      /if\s*\(\s*DIAG_SCROLL\s*\)\s*recordDiagEvent\(`snap #\$\{id\} \$\{[^}]*\}\`\);\s*ref\.current\?\.snapToIndex\(/.test(
        stackedNorm,
      ),
    ).toBe(true);

    // SheetsContext.tsx registra a cada ação despachada: pilha [A > B] → [A] dentro de if (DIAG_SCROLL)
    expect(
      /if\s*\(\s*DIAG_SCROLL\s*\)\s*\{[\s\S]*?recordDiagEvent\(`pilha \$\{action\.type\} \[[\s\S]*?\] → \[[\s\S]*?\]`\);?\s*\}/.test(
        sheetsNorm,
      ),
    ).toBe(true);
  });
});
