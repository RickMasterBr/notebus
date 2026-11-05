/// <reference types="node" />
/**
 * Guarda estático da fiação do rótulo de acessibilidade do cartão de ônibus do "Ir para"
 * (ideia 221, contrato 07c).
 * GUARDA DE TEXTO: confere o código-fonte (uso), não o efeito no VoiceOver do aparelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

const gotoSrc = normalize(readFileSync(join(__dirname, "GotoSheet.tsx"), "utf8"));

describe("gotoCardA11yWiring: rótulo do cartão de ônibus (ideia 221)", () => {
  it("o cartão de ônibus pede a chave a gotoCardA11yKey com leaveAtPassed do cartão", () => {
    expect(gotoSrc).toContain("t(gotoCardA11yKey(card.leaveAtPassed), {");
  });

  it("o cartão de ônibus já não usa a chave fixa bus_card", () => {
    expect(gotoSrc).not.toContain('t("sheet_goto.a11y.bus_card", {');
  });

  it("o cartão a pé continua com a chave fixa walk_card", () => {
    expect(gotoSrc).toContain('t("sheet_goto.a11y.walk_card", {');
  });
});
