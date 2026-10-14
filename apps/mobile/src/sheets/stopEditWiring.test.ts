/// <reference types="node" />
/**
 * Guardas de ligação da edição de ponto (TL-02/E-08 Bloco 3, Item 6).
 * Confere o código-fonte sem comentários e o uso exato de cada ligação da tabela do item 6.
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
const stopSheet = read("sheets/StopSheet.tsx");
const sheetHost = read("sheets/SheetHost.tsx");

describe("StopSheet: botão 'Editar ponto'", () => {
  it("botão 'Editar ponto' empilha stopEdit com o stopId, só no detent Grande", () => {
    expect(stopSheet).toMatch(
      /\{detent === 2 \? \(\s*<Pressable\s+accessibilityRole="button"\s+accessibilityLabel=\{t\("stop_edit\.button"\)\}\s+onPress=\{\(\) => dispatch\(\{ type: "push", sheet: \{ kind: "stopEdit", stopId \} \}\)\}[\s\S]*?\{t\("stop_edit\.button"\)\}[\s\S]*?\) : null\}/,
    );
    expect(stopSheet.match(/kind: "stopEdit"/g)).toHaveLength(1);
    expect(stopSheet).toContain('{ kind: "stopEdit", stopId }');
  });
});

describe("SheetHost: roteamento de stopEdit", () => {
  it("case 'stopEdit' renderiza StopEditSheet com id e stopId", () => {
    expect(sheetHost).toMatch(
      /case "stopEdit":\s*return <StopEditSheet id=\{entry\.id\} stopId=\{entry\.stopId\} \/>;/,
    );
  });
});

describe("StopEditSheet: Salvar e submitGuard", () => {
  it("submitGuard.run envolve a chamada de saveStopEdit", () => {
    expect(stopEditSheet).toContain("const submitGuard = useRef(createSubmitGuard()).current;");
    const saveIdx = stopEditSheet.indexOf("const handleSave = async () => {");
    expect(saveIdx).toBeGreaterThan(-1);
    const runIdx = stopEditSheet.indexOf("await submitGuard.run(async () => {", saveIdx);
    expect(runIdx).toBeGreaterThan(saveIdx);
    const saveCallIdx = stopEditSheet.indexOf("saveStopEdit(", runIdx);
    expect(saveCallIdx).toBeGreaterThan(runIdx);
  });

  it("saveStopEdit recebe nowMs de now() e os campos do rascunho", () => {
    expect(stopEditSheet).toContain("const nowMs = now();");
    expect(stopEditSheet).toMatch(
      /await saveStopEdit\(\s*db,\s*stopId,\s*\{\s*name:\s*draft\.name,\s*aliases:\s*committed\.aliases,\s*externalId:\s*draft\.externalId,\s*note:\s*draft\.note,\s*location:\s*locationEdit\(locationInfo,\s*location\),\s*\},\s*nowMs,\s*\);/,
    );
  });

  it("depois de salvar: reloadStopIndex() é chamado com await e fecha a folha", () => {
    const okIdx = stopEditSheet.indexOf("if (result.ok) {");
    expect(okIdx).toBeGreaterThan(-1);
    const reloadIdx = stopEditSheet.indexOf("await reloadStopIndex();", okIdx);
    expect(reloadIdx).toBeGreaterThan(okIdx);
    const closeIdx = stopEditSheet.indexOf("close();", reloadIdx);
    expect(closeIdx).toBeGreaterThan(reloadIdx);
  });

  it("toast com Desfazer chama undo e depois recarrega o índice", () => {
    expect(stopEditSheet).toMatch(
      /label:\s*t\("toast\.action\.undo"\),\s*run:\s*async\s*\(\)\s*=>\s*\{\s*const undone = await result\.undo\(now\(\)\);\s*await reloadStopIndex\(\);/,
    );
  });

  it("canSave do stopEditView no disabled do Salvar", () => {
    expect(stopEditSheet).toContain("disabled={!view.canSave}");
    expect(stopEditSheet).toContain("accessibilityState={{ disabled: !view.canSave }}");
  });
});

describe("StopEditSheet: campos e erros", () => {
  it("erros por campo ligados ao texto abaixo do campo certo", () => {
    const nameSectionIdx = stopEditSheet.indexOf('{t("stop_edit.name")}');
    expect(nameSectionIdx).toBeGreaterThan(-1);
    const nameErrorIdx = stopEditSheet.indexOf("view.nameError ===", nameSectionIdx);
    expect(nameErrorIdx).toBeGreaterThan(nameSectionIdx);

    const aliasesSectionIdx = stopEditSheet.indexOf('{t("stop_edit.aliases")}');
    expect(aliasesSectionIdx).toBeGreaterThan(-1);
    const aliasErrorIdx = stopEditSheet.indexOf("view.aliasError ===", aliasesSectionIdx);
    expect(aliasErrorIdx).toBeGreaterThan(aliasesSectionIdx);

    const extIdSectionIdx = stopEditSheet.indexOf('{t("stop_edit.external_id")}');
    expect(extIdSectionIdx).toBeGreaterThan(-1);
    const extIdErrorIdx = stopEditSheet.indexOf("view.externalIdError ?", extIdSectionIdx);
    expect(extIdErrorIdx).toBeGreaterThan(extIdSectionIdx);

    const noteSectionIdx = stopEditSheet.indexOf('{t("stop_edit.note")}');
    expect(noteSectionIdx).toBeGreaterThan(-1);
    const noteErrorIdx = stopEditSheet.indexOf("view.noteError ===", noteSectionIdx);
    expect(noteErrorIdx).toBeGreaterThan(noteSectionIdx);

    expect(stopEditSheet.indexOf("view.nameError", extIdSectionIdx)).toBe(-1);
    expect(stopEditSheet.indexOf("view.aliasError", extIdSectionIdx)).toBe(-1);
  });

  it("chips de apelido: ✕ chama handleRemoveAlias com o índice daquele chip", () => {
    expect(stopEditSheet).toMatch(
      /\{draft\.aliases\.map\(\(alias,\s*index\)\s*=>\s*\([\s\S]*?accessibilityLabel=\{t\("stop_edit\.alias\.remove\.a11y",\s*\{\s*alias\s*\}\)\}[\s\S]*?onPress=\{\(\)\s*=>\s*handleRemoveAlias\(index\)\}[\s\S]*?<CrossGlyph[\s\S]*?\)\)\}/,
    );
    expect(stopEditSheet).toMatch(
      /const handleRemoveAlias = \(indexToRemove: number\) => \{\s*setDraft\(\(prev\) => \(\{\s*\.\.\.prev,\s*aliases: prev\.aliases\.filter\(\(_, idx\) => idx !== indexToRemove\),\s*\}\)\);/,
    );
  });
});

describe("StopEditSheet: ciclo de vida e localização", () => {
  it("useEffect do estado inicial depende estritamente de [stopId]", () => {
    const effectIdx = stopEditSheet.indexOf("useEffect(() => {");
    expect(effectIdx).toBeGreaterThan(-1);
    const endEffectIdx = stopEditSheet.indexOf("}, [stopId]);", effectIdx);
    expect(endEffectIdx).toBeGreaterThan(effectIdx);
    expect(stopEditSheet.slice(endEffectIdx, endEffectIdx + 13)).toBe("}, [stopId]);");
  });

  it("localização só leitura: a folha não chama saveStopLocation", () => {
    expect(stopEditSheet).not.toContain("saveStopLocation");
  });
});

describe("StopEditSheet: uso das decisões (bloco 4)", () => {
  it("handleSave começa com a guarda de canSave e validation.ok", () => {
    expect(stopEditSheet).toMatch(
      /const handleSave = async \(\) => \{\s*if \(!view\.canSave \|\| !validation\.ok\) return;\s*await submitGuard\.run\(/,
    );
  });

  it("Desfazer vencido: o ramo !undone.ok abre o toast de erro com a chave stale", () => {
    expect(stopEditSheet).toMatch(
      /if \(!undone\.ok\) \{\s*toast\.show\(\{\s*title: t\("stop_edit\.error\.stale"\),\s*kind: "error",/,
    );
  });

  it("erro de apelido same_as_name mostra a chave própria; too_many mostra o max", () => {
    expect(stopEditSheet).toMatch(
      /view\.aliasError === "same_as_name" \? \(\s*<Text[^>]*>\s*\{t\("stop_edit\.error\.alias_same_as_name"\)\}\s*<\/Text>/,
    );
    expect(stopEditSheet).toMatch(
      /view\.aliasError === "too_many" \? \(\s*<Text[^>]*>\s*\{t\("stop_edit\.error\.alias_too_many", \{ max: MAX_ALIASES \}\)\}\s*<\/Text>/,
    );
  });

  it("erro do Salvar: duplicate_external_id usa a chave do ID; qualquer outra razão usa a genérica", () => {
    expect(stopEditSheet).toMatch(
      /setSaveError\(\s*result\.reason === "duplicate_external_id"\s*\? t\("stop_edit\.error\.external_id_taken", \{ name: "" \}\)\s*: t\("stop_edit\.error\.generic"\),\s*\);/,
    );
  });
});
