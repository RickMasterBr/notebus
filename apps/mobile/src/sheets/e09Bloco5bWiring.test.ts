/// <reference types="node" />
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

describe("E-09 Bloco 5b guardas de ligação (e09Bloco5bWiring)", () => {
  describe("Item 0.1 · avisos: o resultado de toggleAlarms volta ao interruptor", () => {
    const settings = squash(read("sheets/SettingsSheet.tsx"));

    it("handleToggleAlarms devolve o resultado de toggleAlarms", () => {
      expect(settings).toMatch(/const handleToggleAlarms = \(val: boolean\) => \{ return toggleAlarms\(\{ next: val,/);
    });

    it("o <Switch> de avisos consome valor e onValueChange do interruptor otimista", () => {
      expect(settings).toMatch(
        /<Switch accessibilityLabel=\{t\("settings\.alarms\.allow"\)\} value=\{alarmsSwitch\.value\} onValueChange=\{alarmsSwitch\.onValueChange\}/,
      );
    });
  });

  describe("Item 1 · FN-13 interruptores com espaço vertical e centrados", () => {
    const holiday = squash(read("sheets/HolidaySheet.tsx"));
    const edit = squash(read("sheets/LineEditSheet.tsx"));

    it("Repete todo ano: switchRow com paddingVertical e o <Switch> centrado", () => {
      expect(holiday).toMatch(/switchRow: \{[^}]*minHeight: minTouch,[^}]*paddingVertical: space\.sm,[^}]*\}/);
      expect(holiday).toMatch(/<Switch accessibilityLabel=\{t\("holiday\.every_year"\)\} style=\{\{ alignSelf: "center" \}\}/);
    });

    it("Circular: switchRow com paddingVertical e o <Switch> centrado", () => {
      expect(edit).toMatch(/switchRow: \{[^}]*minHeight: minTouch, paddingVertical: space\.sm,[^}]*\}/);
      expect(edit).toMatch(/<Switch accessibilityLabel=\{t\("line_create\.circular"\)\} style=\{\{ alignSelf: "center" \}\}/);
    });

    it("Avisos em Ajustes: switchRow com o <Switch> com alignSelf: \"center\"", () => {
      const settings = squash(read("sheets/SettingsSheet.tsx"));
      expect(settings).toMatch(
        /styles\.switchRow[\s\S]*?<Switch\b[^>]*accessibilityLabel=\{t\("settings\.alarms\.allow"\)\}[^>]*style=\{\{\s*alignSelf:\s*"center"\s*\}\}/,
      );
    });

    it("Feriados municipais em Ajustes: switchRow com o <Switch> com alignSelf: \"center\"", () => {
      const settings = squash(read("sheets/SettingsSheet.tsx"));
      expect(settings).toMatch(
        /styles\.switchRow[\s\S]*?<Switch\b[^>]*accessibilityLabel=\{t\("settings\.holiday\.municipal"\)\}[^>]*style=\{\{\s*alignSelf:\s*"center"\s*\}\}/,
      );
    });
  });

  describe("Item 2 · FN-15 a Início encolhe sem vazio e sem salto", () => {
    const home = squash(read("sheets/HomeSheet.tsx"));

    it("a altura animada vem do progresso da opacidade e da altura medida do conteúdo", () => {
      expect(home).toContain(
        "height: homeFadeHeight(homeFadeProgress(sheetTop.value, topAtSmall, topAtMedium), phraseHeight)",
      );
      expect(home).toContain(
        "height: homeFadeHeight(homeFadeProgress(sheetTop.value, topAtSmall, topAtMedium), pendingHeight)",
      );
    });

    it("a medida vem do conteúdo interno, dentro do contêiner que encolhe", () => {
      expect(home).toMatch(/<View collapsable=\{false\} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{styles\.phraseMeasure\} onLayout=\{\(e\) => setPhraseHeight\(\(prev\) => nextPhraseHeight\(prev, e\.nativeEvent\.layout\.height\)\)\} > <HomePhrase/);
      expect(home).toMatch(/phraseClipStyle : null\]\} > <HomePhrase/);
      expect(home).not.toMatch(/phraseClipStyle[^}]*\} onLayout/);
      expect(home).toMatch(/pendingClipStyle.*?> <View collapsable=\{false\} onLayout=\{\(e\) => setPendingHeight\(e\.nativeEvent\.layout\.height\)\}> <Pressable/);
    });

    it("os dois contêineres cortam o excesso e mantêm toque e leitura fora quando invisíveis", () => {
      expect(home).toMatch(/clip: \{ overflow: "hidden" \}/);
      expect(home).toMatch(/style=\{\[styles\.clip, fadeStyle, phraseHeight > 0 \? phraseClipStyle : null\]\}/);
      expect(home).toMatch(/style=\{\[styles\.clip, fadeStyle, pendingHeight > 0 \? pendingClipStyle : null\]\} pointerEvents=\{state\.detent === 0 \? "none" : "auto"\} accessibilityElementsHidden=\{state\.detent === 0\}/);
    });

    it("a lista não muda de conta: scrollAreaHeight subtrai a altura medida da frase", () => {
      expect(home).toMatch(/cards\.effectiveHeight - phraseHeight - space\.md/);
    });
  });
});
