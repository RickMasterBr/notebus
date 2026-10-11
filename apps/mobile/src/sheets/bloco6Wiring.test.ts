/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 6: confere o USO no texto-fonte (VoiceOver, aparência e teclado só o aparelho decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIELD_LIMITS } from "../data/stopEdit";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const declareSheet = read("sheets/DeclareSheet.tsx");
const recordSheet = read("sheets/RecordSheet.tsx");
const overrideSheet = read("sheets/OverrideSheet.tsx");
const pickerModal = read("ui/PickerModal.tsx");
const marginStepper = read("sheets/MarginStepper.tsx");
const stopEditSheet = read("sheets/StopEditSheet.tsx");
const stopSheet = read("sheets/StopSheet.tsx");
const stopCardView = read("ui/StopCardView.tsx");
const listRow = read("ui/ListRow.tsx");

describe("item 0: lacunas das mutações da coordenação", () => {
  it("0.1: o Desfazer do aviso de remoção usa result.undo e mostra o erro se falhar", () => {
    expect(declareSheet).toMatch(
      /const undone = await result\.undo\(now\(\)\);\s+if \(!undone\.ok\) toast\.show\(\{ title: t\("declare\.error\.stale"\)/,
    );
  });

  it("0.4: o debounce limpa o temporizador de verdade", () => {
    expect(marginStepper).toContain("clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)");
  });

  it("0.5: o botão apaga pelo valor exibido, não pelo gravado", () => {
    expect(marginStepper).toContain("marginLimits(margin)");
    expect(marginStepper).not.toContain("marginLimits(prefs.margin)");
  });

  it("0.6: as ações do VoiceOver passam por adjustableStep e chamam stepper.step com o resultado", () => {
    expect(marginStepper).toMatch(
      /onAccessibilityAction=\{\(e\) => \{\s+const direction = adjustableStep\(e\.nativeEvent\.actionName\);\s+if \(direction !== null\) stepper\.step\(direction\);\s+\}\}/,
    );
  });
});

describe("item 1: seletor de hora no VoiceOver", () => {
  it.each([
    ["DeclareSheet", declareSheet],
    ["RecordSheet", recordSheet],
    ["OverrideSheet", overrideSheet],
  ])("%s usa PickerModal e não tem mais a caixa que engole o foco", (_name, source) => {
    expect(source).toContain("<PickerModal");
    expect(source).not.toContain("stopPropagation");
    expect(source).not.toContain("<Modal");
    expect(source).toContain('doneLabel={t("alarm.repeat.done")}');
  });

  it("PickerModal: caixa modal para o VoiceOver, escape fecha, fundo fora da leitura e botão com rótulo", () => {
    expect(pickerModal).toContain("accessibilityViewIsModal");
    expect(pickerModal).toContain("onAccessibilityEscape={onClose}");
    expect(pickerModal).toMatch(/<Pressable\s+accessible=\{false\}/);
    expect(pickerModal).toContain("accessibilityLabel={doneLabel}");
  });

  it("PickerModal: o fundo e a caixa são irmãos; seletor e Pronto não estão dentro de um Pressable", () => {
    const background = pickerModal.indexOf("accessible={false}");
    const backgroundEnd = pickerModal.indexOf("/>", background);
    const box = pickerModal.indexOf("accessibilityViewIsModal");
    const children = pickerModal.indexOf("{children}");
    const done = pickerModal.indexOf("accessibilityLabel={doneLabel}");
    expect(background).toBeGreaterThan(-1);
    expect(backgroundEnd).toBeLessThan(box);
    expect(pickerModal.slice(backgroundEnd, children)).not.toContain("<Pressable");
    expect(pickerModal.slice(box, children)).not.toContain("<Pressable");
    expect(children).toBeLessThan(done);
    const afterDone = pickerModal.slice(pickerModal.indexOf("</Pressable>", done));
    expect(afterDone.indexOf("</View>")).toBeLessThan(afterDone.indexOf("</Modal>"));
  });
});

describe("item 2: limite de digitação em Editar ponto", () => {
  it("FIELD_LIMITS fixa 80, 60, 20 e 200", () => {
    expect(FIELD_LIMITS).toEqual({ name: 80, alias: 60, externalId: 20, note: 200 });
  });

  it.each([
    ["draft.name", "name"],
    ["newAliasText", "alias"],
    ['draft.externalId ?? ""', "externalId"],
    ['draft.note ?? ""', "note"],
  ])("o campo %s usa FIELD_LIMITS.%s", (value, key) => {
    const flat = stopEditSheet.replace(/\s+/g, " ");
    expect(flat).toContain(`<BottomSheetTextInput value={${value}} maxLength={FIELD_LIMITS.${key}}`);
  });

  it("são exatamente quatro campos com maxLength", () => {
    expect(stopEditSheet.match(/maxLength=\{/g)).toHaveLength(4);
  });
});

describe("item 3: apelidos dentro do cartão do Ponto", () => {
  it("StopSheet passa aliases ao cartão e não tem mais o texto solto", () => {
    expect(stopSheet).toMatch(/<StopCardView[^>]*aliases=\{aliases\}/);
    expect(stopSheet).not.toMatch(/\{aliases \?/);
  });

  it("StopCardView mostra aliases num Text dentro do próprio componente", () => {
    expect(stopCardView).toMatch(/aliases\?: string \| null/);
    expect(stopCardView).toMatch(/\{aliases \? <Text[^>]*>\{aliases\}<\/Text> : null\}/);
  });
});

describe("item 4: apelido ao lado do ID na busca", () => {
  it("ListRow imprime uma linha só com subline(detail, extra)", () => {
    expect(listRow).toContain("subline(detail, extra)");
    expect(listRow).not.toMatch(/\{detail \?/);
    expect(listRow).not.toMatch(/\{extra \?/);
  });
});
