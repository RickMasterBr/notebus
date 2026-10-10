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
  diagScrollEnabled: boolean;
  stripReadsHomePointerEvents: boolean;
  stripDoesNotHardcodeHomeValue: boolean;
  stripReadsDiagLog: boolean;
}

export function checkDiagScrollWiring(source: string): DiagScrollWiringCheck {
  const norm = normalize(source);

  const diagScrollEnabled = /export\s+const\s+DIAG_SCROLL\s*=\s*true\b/.test(norm);

  const stripReadsHomePointerEvents =
    norm.includes("homeLayerPointerEvents(") &&
    /home=\$\{/.test(norm);

  const stripDoesNotHardcodeHomeValue =
    !/home=box-none\b/.test(norm) && !/home=none\b/.test(norm);

  const stripReadsDiagLog =
    norm.includes("formatDiagLog(") &&
    norm.includes("pushDiagEvent(");

  return {
    diagScrollEnabled,
    stripReadsHomePointerEvents,
    stripDoesNotHardcodeHomeValue,
    stripReadsDiagLog,
  };
}

describe("guarda estático de diagnóstico (Item 2)", () => {
  const sheetHostPath = join(__dirname, "SheetHost.tsx");
  const sheetHostSource = readFileSync(sheetHostPath, "utf8");

  const diagScrollPath = join(__dirname, "diagScroll.tsx");
  const diagScrollSource = readFileSync(diagScrollPath, "utf8");

  it("(1) SheetHost.tsx usa homeLayerPointerEvents(stacked.length) no pointerEvents da primeira View", () => {
    const checks = checkSheetHostWiring(sheetHostSource);
    expect(checks.callsHomeLayerPointerEvents).toBe(true);
    expect(checks.homeLayerUsesDynamicPointerEvents).toBe(true);
  });

  it("(2) diagScroll.tsx lê o registro e homeLayerPointerEvents na faixa (sem texto fixo)", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.stripReadsHomePointerEvents).toBe(true);
    expect(checks.stripDoesNotHardcodeHomeValue).toBe(true);
    expect(checks.stripReadsDiagLog).toBe(true);
  });

  it("(3) DIAG_SCROLL = true em diagScroll.tsx", () => {
    const checks = checkDiagScrollWiring(diagScrollSource);
    expect(checks.diagScrollEnabled).toBe(true);
  });
});
