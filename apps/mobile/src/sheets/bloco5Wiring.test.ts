/// <reference types="node" />
/**
 * Guardas de ligação do bloco 5 da E-08 (8b): confere o USO no texto-fonte (sem comentários), não só a presença.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const stopSheet = read("sheets/StopSheet.tsx");
const declareSheet = read("sheets/DeclareSheet.tsx");

describe("item 1: nome do ponto pelo índice da busca", () => {
  it("StopSheet resolve o nome com stopNameFor(stopIndex, stopId, name) e usa o resolvido no cartão e no título", () => {
    expect(stopSheet).toContain("const stopIndex = useStopIndex();");
    expect(stopSheet).toContain("const stopName = stopNameFor(stopIndex, stopId, name);");
    expect(stopSheet).toContain("<StopCardView card={{ ...card, name: stopName }} />");
    expect(stopSheet).toMatch(/<Text accessibilityRole="header"[^>]*>\s*\{stopName\}\s*<\/Text>/);
    expect(stopSheet).not.toMatch(/\{name\}\s*<\/Text>/);
  });

  it("StopSheet mostra a linha de apelidos logo abaixo do cartão, só quando há apelido", () => {
    expect(stopSheet).toContain("const aliases = aliasesLine(stopIndex, stopId);");
    const cardIdx = stopSheet.indexOf("<StopCardView card={{ ...card, name: stopName }} />");
    const aliasIdx = stopSheet.indexOf("{aliases ? <Text");
    const listIdx = stopSheet.indexOf("style={styles.list}");
    expect(cardIdx).toBeGreaterThan(-1);
    expect(aliasIdx).toBeGreaterThan(cardIdx);
    expect(aliasIdx).toBeLessThan(listIdx);
    expect(stopSheet).toMatch(/\{aliases \? <Text style=\{\[type\.caption, \{ color: colors\.textSecondary \}\]\}>\{aliases\}<\/Text> : null\}/);
  });

  it("DeclareSheet resolve o nome do cabeçalho pelo índice, com o do snapshot como reserva", () => {
    expect(declareSheet).toContain("const stopIndex = useStopIndex();");
    expect(declareSheet).toContain('const stopName = stopNameFor(stopIndex, stopId, data?.stopNames.get(stopId) ?? "");');
    expect(declareSheet).toMatch(/\{stopName\}<\/Text>/);
  });
});
