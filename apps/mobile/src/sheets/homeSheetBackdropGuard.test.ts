/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export interface BackdropGuardViolations {
  hasAppearsOnIndex2: boolean;
  hasDisappearsOnIndex1: boolean;
  hasPressBehavior0: boolean;
}

/**
 * Analisa HomeSheet.tsx e verifica se o BottomSheetBackdrop contém:
 * - appearsOnIndex={2}
 * - disappearsOnIndex={1}
 * - pressBehavior={0}
 */
export function checkHomeSheetBackdropProps(source: string): BackdropGuardViolations {
  const match = /<BottomSheetBackdrop\b([\s\S]*?)\/>/m.exec(source);
  if (!match) {
    return {
      hasAppearsOnIndex2: false,
      hasDisappearsOnIndex1: false,
      hasPressBehavior0: false,
    };
  }

  const props = match[1] ?? "";
  return {
    hasAppearsOnIndex2: /\bappearsOnIndex=\{\s*2\s*\}/.test(props),
    hasDisappearsOnIndex1: /\bdisappearsOnIndex=\{\s*1\s*\}/.test(props),
    hasPressBehavior0: /\bpressBehavior=\{\s*0\s*\}/.test(props),
  };
}

describe("guarda estático do BottomSheetBackdrop em HomeSheet.tsx (Item 1.1)", () => {
  it("HomeSheet.tsx possui appearsOnIndex={2}, disappearsOnIndex={1} e pressBehavior={0}", () => {
    const filePath = join(__dirname, "./HomeSheet.tsx");
    const content = readFileSync(filePath, "utf8");
    const result = checkHomeSheetBackdropProps(content);
    expect(result.hasAppearsOnIndex2, "Falta appearsOnIndex={2}").toBe(true);
    expect(result.hasDisappearsOnIndex1, "Falta disappearsOnIndex={1}").toBe(true);
    expect(result.hasPressBehavior0, "Falta pressBehavior={0}").toBe(true);
  });

  it("falha quando appearsOnIndex não é 2", () => {
    const mock = `
      <BottomSheetBackdrop
        disappearsOnIndex={1}
        pressBehavior={0}
      />
    `;
    const result = checkHomeSheetBackdropProps(mock);
    expect(result.hasAppearsOnIndex2).toBe(false);
  });

  it("falha quando disappearsOnIndex não é 1", () => {
    const mock = `
      <BottomSheetBackdrop
        appearsOnIndex={2}
        pressBehavior={0}
      />
    `;
    const result = checkHomeSheetBackdropProps(mock);
    expect(result.hasDisappearsOnIndex1).toBe(false);
  });

  it("falha quando pressBehavior não é 0", () => {
    const mock = `
      <BottomSheetBackdrop
        appearsOnIndex={2}
        disappearsOnIndex={1}
        pressBehavior="close"
      />
    `;
    const result = checkHomeSheetBackdropProps(mock);
    expect(result.hasPressBehavior0).toBe(false);
  });
});
