/// <reference types="node" />
/**
 * Guardas de ligação da remoção do horário declarado (E-08 bloco 5, item 8): confere o USO no texto-fonte.
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

const declareSheet = read("sheets/DeclareSheet.tsx");
const provider = read("data/DeclaredTimesProvider.tsx");

describe("DeclareSheet: seção 'Declarados neste ponto'", () => {
  it("a lista vem de declaredList(stopId, data) e a seção só aparece quando há linhas", () => {
    expect(declareSheet).toContain("const declaredRows = useMemo(() => (data ? declaredList(stopId, data) : []), [data, stopId]);");
    expect(declareSheet).toMatch(/\{declaredRows\.length > 0 \? \(\s*<View style=\{styles\.section\}>\s*<Text accessibilityRole="header"[^>]*>\s*\{t\("declare\.remove\.title"\)\}/);
    expect(declareSheet).toContain("{declaredRows.map((row) => (");
  });

  it("cada linha tem o botão Remover com nome acessível e onPress que remove a linha", () => {
    expect(declareSheet).toMatch(
      /<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{t\("declare\.remove\.a11y", \{ time: row\.timeText, line: row\.lineCode \}\)\}\s+onPress=\{\(\) => void handleRemove\(row\)\}[\s\S]*?\{t\("declare\.remove\.button"\)\}/,
    );
  });

  it("o alvo de toque do Remover tem pelo menos 44 pt (minTouch)", () => {
    expect(declareSheet).toMatch(/removeButton: \{ minHeight: minTouch, minWidth: minTouch,/);
  });

  it("handleRemove chama removeDeclared com removePlan(stopId, row) e usa o resultado (aviso com Desfazer, erro)", () => {
    const fn = declareSheet.slice(declareSheet.indexOf("const handleRemove = async"));
    expect(fn).toContain("const result = await declared.removeDeclared(removePlan(stopId, row), now());");
    expect(fn).toContain("if (result.ok) {");
    expect(fn).toContain("title: removeToast(result.restoredOfficialMinute),");
    expect(fn).toContain("const undone = await result.undo(now());");
    expect(fn).toMatch(/result\.reason === "stale" \? t\("declare\.error\.stale"\) : t\("declare\.error\.generic"\)/);
  });

  it("a remoção passa pela guarda de envio duplo", () => {
    const fn = declareSheet.slice(declareSheet.indexOf("const handleRemove = async"));
    expect(fn.indexOf("await submitGuard.run(async () => {")).toBeGreaterThan(-1);
    expect(fn.indexOf("await submitGuard.run(async () => {")).toBeLessThan(fn.indexOf("removeDeclared("));
  });
});

describe("DeclaredTimesProvider entrega removeDeclared pelo mesmo objeto do declare", () => {
  it("usa createDeclaredTimes com reload, rematch e reschedule", () => {
    expect(provider).toContain("createDeclaredTimes<ScheduleSnapshot>({");
    expect(provider).toContain("reload,");
    expect(provider).toContain("rematch:");
    expect(provider).toContain("reschedule:");
  });
});
