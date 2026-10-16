import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stripComments = (code: string) =>
  code
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => stripComments(text).replace(/\s+/g, " ");

const rawNearbyStops = readFileSync(new URL("./NearbyStops.tsx", import.meta.url), "utf8");
const squashed = squash(rawNearbyStops);

describe("E-09 bloco 24 (FN-29): guarda de ligação de NearbyStops", () => {
  it("pickNearbyCards chamado com byFix, recent.ids e buildCard que usa registro.records", () => {
    expect(squashed).toMatch(
      /pickNearbyCards\(\s*byFix\s*,\s*recent\.ids\s*,\s*\(id\)\s*=>\s*buildStopCard\(\s*id\s*,\s*schedule\.data\s*,\s*instant\s*,\s*registro\.records\s*\)\s*,?\s*\)/,
    );
    const match = squashed.match(/const picked = useMemo\([\s\S]*?,\s*\[([^\]]+)\]\s*,?\s*\);/);
    expect(match).not.toBeNull();
    const deps = (match?.[1] ?? "").split(",").map((s) => s.trim());
    expect(deps).toContain("registro.records");
  });

  it("retorna null somente quando picked.cards.length === 0", () => {
    expect(squashed).toMatch(
      /if\s*\(\s*picked\.cards\.length\s*===\s*0\s*\)\s*return null;/,
    );
    const skeletonCheck = squashed.indexOf("if (loading || skeleton)");
    const sectionStart = squashed.indexOf("<Section>");
    const between = squashed.slice(skeletonCheck, sectionStart);
    // Garante que não há return null incondicional entre a checagem de loading e a montagem da Section
    expect(between).not.toMatch(/;\s*return null;\s*(?!if\s*\(\s*picked\.cards\.length)/);
  });

  it("cards.map sobre picked.cards", () => {
    expect(squashed).toMatch(/\{picked\.cards\.map\(\s*\(card\)\s*=>/);
  });

  it("consome picked por campo (picked.cards) e não devolve nem mapeia diretamente sobre byFix", () => {
    expect(squashed).toContain("picked.cards");
    expect(squashed).not.toMatch(/byFix\.map\(/);
    expect(squashed).toMatch(/<Section>\s*\{picked\.cards\.map/);
  });

  it("registro de diagnóstico perto sob if (DIAG_SCROLL) em useEffect, nunca no corpo do render", () => {
    expect(squashed).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{\s*if\s*\(DIAG_SCROLL\)\s*recordDiagEvent\(`perto fonte=\$\{picked\.source\} fix=\$\{byFix\.length\} recentes=\$\{recent\.ids\.length\} cartoes=\$\{picked\.cards\.length\} estados=\$\{stops\.status\}\/\$\{schedule\.status\}\/\$\{recent\.status\}`\);\s*\},/,
    );
    const lines = rawNearbyStops.split(/\r?\n/);
    const diagCalls = lines.filter((l) => l.includes("recordDiagEvent(") && !l.includes("import"));
    expect(diagCalls.length).toBeGreaterThan(0);
    for (const line of diagCalls) {
      expect(line).toMatch(/^\s*if\s*\(DIAG_SCROLL\)\s*recordDiagEvent\(/);
    }
  });
});
