/// <reference types="node" />
/**
 * Guardas de ligação do bloco 5 da E-08 (itens 2 a 7): confere o USO no texto-fonte (sem comentários).
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

const stopEditSheet = read("sheets/StopEditSheet.tsx");
const searchSheet = read("sheets/SearchSheet.tsx");
const keyboardHook = read("sheets/useKeyboardHeight.ts");
const toastController = read("data/toastController.ts");
const dbStopEdit = read("db/stopEdit.ts");

describe("item 2: teclado na StopEditSheet", () => {
  it("usa useKeyboardHeight e soma a altura do teclado ao paddingBottom da rolagem", () => {
    expect(stopEditSheet).toContain("const keyboard = useKeyboardHeight();");
    expect(stopEditSheet).toMatch(
      /<BottomSheetScrollView\s+ref=\{scrollRef\}[\s\S]*?contentContainerStyle=\{\[styles\.scrollContent, \{ paddingBottom: space\.lg \+ keyboard \}\]\}/,
    );
  });

  it("ao focar apelido, ID externo e nota, rola até a seção", () => {
    expect(stopEditSheet).toContain('onFocus={() => scrollToSection("aliases")}');
    expect(stopEditSheet).toContain('onFocus={() => scrollToSection("externalId")}');
    expect(stopEditSheet).toContain('onFocus={() => scrollToSection("note")}');
    expect(stopEditSheet).toContain("scrollRef.current?.scrollTo(");
  });

  it("o hook remove as duas escutas na saída", () => {
    const cleanup = keyboardHook.slice(keyboardHook.indexOf("return () => {"));
    expect(cleanup).toContain("show.remove();");
    expect(cleanup).toContain("hide.remove();");
  });
});

describe("item 3: ordem do apelido", () => {
  it("o campo de novo apelido vem antes das pastilhas, e o botão Adicionar também", () => {
    const input = stopEditSheet.indexOf("value={newAliasText}");
    const add = stopEditSheet.indexOf("onPress={handleAddAlias}");
    const chips = stopEditSheet.indexOf("draft.aliases.map(");
    expect(input).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(input);
    expect(chips).toBeGreaterThan(add);
  });

  it("as pastilhas ficam dentro da seção de apelidos, antes do ID externo", () => {
    const chips = stopEditSheet.indexOf("draft.aliases.map(");
    const externalSection = stopEditSheet.indexOf("t(\"stop_edit.external_id\")");
    expect(chips).toBeLessThan(externalSection);
  });
});

describe("item 4: apelido pendente entra ao Salvar", () => {
  it("handleSave chama commitPendingAlias antes de saveStopEdit e grava o resultado", () => {
    const save = stopEditSheet.indexOf("const handleSave = async () => {");
    const commit = stopEditSheet.indexOf("commitPendingAlias(draft.aliases, newAliasText, draft.name)", save);
    const call = stopEditSheet.indexOf("await saveStopEdit(", save);
    expect(commit).toBeGreaterThan(save);
    expect(call).toBeGreaterThan(commit);
    expect(stopEditSheet).toMatch(/if \(!committed\.ok\) \{\s*setAliasError\(committed\.reason\);\s*return;\s*\}/);
    expect(stopEditSheet).toMatch(/aliases:\s*committed\.aliases,/);
  });

  it("o texto do campo chega ao stopEditView como pendingAlias", () => {
    expect(stopEditSheet).toContain("pendingAlias: newAliasText,");
  });
});

describe("item 5: limite do ID externo", () => {
  it("a folha passa o ID original para a validação e mostra o erro sob o campo", () => {
    expect(stopEditSheet).toContain("originalExternalId: original.externalId,");
    expect(stopEditSheet).toMatch(/\{view\.externalIdTooLong \? \(\s*<Text[^>]*>\s*\{t\("stop_edit\.error\.too_long"\)\}/);
  });

  it("o banco usa externalIdTooLong com o ID que o ponto já tem", () => {
    expect(dbStopEdit).toContain("externalIdTooLong(externalIdTrimmed, existing.externalId)");
  });
});

describe("item 6: toast com ação", () => {
  it("o tempo vem de toastDuration(spec), que olha a ação", () => {
    expect(toastController).toContain("}, toastDuration(spec));");
    expect(toastController).toContain("if (spec.action) return spec.screenReader ? TOAST_MS_ACTION_SCREEN_READER : TOAST_MS_ACTION;");
  });
});

describe("item 7: apelido que casou na busca", () => {
  it("o resultado calcula matchedAlias(stop, term) só nos resultados e passa a linha ao ListRow", () => {
    expect(searchSheet).toContain('const alias = panel === "results" ? matchedAlias(stop, term) : null;');
    expect(searchSheet).toContain('const aliasText = alias ? t("search.result.alias", { alias }) : undefined;');
    expect(searchSheet).toMatch(/<ListRow[\s\S]*?extra=\{aliasText\}[\s\S]*?\/>/);
  });

  it("a leitura do VoiceOver inclui o apelido", () => {
    expect(searchSheet).toContain("accessibilityLabel={aliasText ? `${base}, ${aliasText}` : base}");
  });
});
