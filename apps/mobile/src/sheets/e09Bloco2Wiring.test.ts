/// <reference types="node" />
/**
 * Guardas do E-09 bloco 2: "Desci aqui" espremido no texto grande (Item 1).
 * A regra é pura (`shouldStackTripButtons`); a ligação confere que o cartão a chama com o `fontScale` da janela
 * e aplica o estilo empilhado na linha de ações e no botão.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STACK_FONT_SCALE, shouldStackTripButtons } from "../ui/stackFontScale";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

describe("E-09 bloco 2: cartão Em viagem empilha com o texto grande", () => {
  it("regra: empilha a partir do limiar (1,25), não abaixo", () => {
    expect(shouldStackTripButtons(1)).toBe(false);
    expect(shouldStackTripButtons(1.24)).toBe(false);
    expect(shouldStackTripButtons(STACK_FONT_SCALE)).toBe(true);
    expect(shouldStackTripButtons(3.571)).toBe(true);
  });

  it("limiar único: AheadSheet e o cartão importam o mesmo, sem número solto", () => {
    expect(read("sheets/AheadSheet.tsx")).toMatch(/import \{ STACK_FONT_SCALE \} from "\.\.\/ui\/stackFontScale"/);
    expect(read("sheets/AheadSheet.tsx")).not.toMatch(/const STACK_FONT_SCALE/);
  });

  it("ligação: o cartão decide com o fontScale e aplica o layout empilhado", () => {
    const card = read("ui/TripCard.tsx");
    expect(card).toMatch(/const stacked = shouldStackTripButtons\(useWindowDimensions\(\)\.fontScale\);/);
    expect(card).toMatch(/style=\{\[styles\.actions, stacked && styles\.actionsStacked\]\}/);
    expect(card).toMatch(/styles\.alight, stacked && styles\.alightStacked,/);
    expect(card).toMatch(/actionsStacked: \{ flexDirection: "column", alignItems: "stretch" \}/);
    expect(card).toMatch(/alight: \{ flex: 1, minHeight: 44,/);
  });
});
