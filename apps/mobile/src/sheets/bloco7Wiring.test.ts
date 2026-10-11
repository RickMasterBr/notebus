/// <reference types="node" />
/**
 * Guardas de ligação do E-08 bloco 7: confere o USO no texto-fonte (arrastar, toque, aparência e VoiceOver só o aparelho decide).
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

const squash = (text: string) => text.replace(/\s+/g, " ");

const declareSheet = squash(read("sheets/DeclareSheet.tsx"));
const overrideSheet = squash(read("sheets/OverrideSheet.tsx"));
const recordSheet = squash(read("sheets/RecordSheet.tsx"));
const stopCardView = squash(read("ui/StopCardView.tsx"));

const pickerBlock = (source: string, visibleProp: string) => {
  const match = source.match(new RegExp(`<PickerModal visible=\\{${visibleProp}\\}.*?> <DateTimePicker`));
  return match?.[0] ?? "";
};

describe("item 0: lacunas das mutações do bloco 6", () => {
  it("0.1: o Pronto do seletor de hora do DeclareSheet grava a hora escolhida e fecha o seletor", () => {
    expect(declareSheet).toContain(
      "onDone={() => { setHour({ hour: pickerDate.getHours(), minute: pickerDate.getMinutes() }); setShowPicker(false); }}",
    );
  });

  it("0.2: o fechar do PickerModal do DeclareSheet fecha o seletor", () => {
    expect(pickerBlock(declareSheet, "showPicker")).toContain("onClose={() => setShowPicker(false)}");
  });

  it("0.3: o PickerModal do OverrideSheet abre e fecha pelo estado e o Pronto fecha", () => {
    const block = pickerBlock(overrideSheet, "showDatePicker");
    expect(block).toContain("onClose={() => setShowDatePicker(false)}");
    expect(block).toContain("onDone={() => setShowDatePicker(false)}");
  });

  it("0.4: o PickerModal do RecordSheet fecha pelo fechar e pelo Pronto", () => {
    const block = pickerBlock(recordSheet, "showPicker");
    expect(block).toContain("onClose={() => setShowPicker(false)}");
    expect(block).toContain("onDone={() => setShowPicker(false)}");
  });

  it("0.5: o cartão do ponto monta o rótulo com cardLabel e usa o mesmo rótulo nos dois ramos", () => {
    expect(stopCardView).toContain("const a11yLabel = cardLabel(cardA11y(card, subtitle), aliases);");
    expect(stopCardView.match(/accessibilityLabel=\{a11yLabel\}/g)).toHaveLength(2);
  });
});
