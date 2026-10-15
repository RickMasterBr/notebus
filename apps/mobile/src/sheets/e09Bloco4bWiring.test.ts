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

describe("E-09 Bloco 4b guardas de ligação (e09Bloco4bWiring)", () => {
  describe("Item 1 · FN-6 interruptores", () => {
    const settings = squash(read("sheets/SettingsSheet.tsx"));
    const hook = squash(read("ui/useOptimisticSwitch.ts"));
    const record = squash(read("sheets/RecordSheet.tsx"));
    const visual = squash(read("ui/AnimatedSwitchVisual.tsx"));

    it("o <Switch> de avisos usa o valor otimista", () => {
      expect(settings).toContain("useOptimisticSwitch(prefs.alarmsAllowed, handleToggleAlarms)");
      expect(settings).toMatch(/<Switch[^>]*value=\{alarmsSwitch\.value\} onValueChange=\{alarmsSwitch\.onValueChange\}/);
    });

    it("o <Switch> de feriados municipais usa o valor otimista", () => {
      expect(settings).toContain("useOptimisticSwitch(prefs.includeMunicipalHolidays, prefs.setIncludeMunicipalHolidays)");
      expect(settings).toMatch(/<Switch[^>]*value=\{municipalSwitch\.value\} onValueChange=\{municipalSwitch\.onValueChange\}/);
    });

    it("o hook mostra shownValue e encerra o pedido no finally, também na falha", () => {
      expect(hook).toContain("value: shownValue(saved, state)");
      expect(hook).toMatch(/catch \{[^}]*\} finally \{ apply\(settle\(ref\.current, next\.seq\)\); \}/);
    });

    it("o registro usa o interruptor animado e a duração vem da constante, com reduceMotion", () => {
      expect(record).toContain("<AnimatedSwitchVisual on={draft.memory} />");
      expect(record).toContain('accessibilityRole="switch"');
      expect(record).toContain("accessibilityState={{ checked: draft.memory }}");
      expect(visual).toContain("duration: reduceMotion ? 0 : SWITCH_ANIM_MS");
      expect(visual).toMatch(/export const SWITCH_ANIM_MS = [1-9]\d+;/);
    });
  });

  describe("Item 2 · FN-7 campo Repete todo ano", () => {
    const holiday = squash(read("sheets/HolidaySheet.tsx"));

    it("a linha usa fundo de campo e borda do campo, e o estilo tem raio do campo", () => {
      expect(holiday).toContain("<View style={[styles.switchRow, { backgroundColor: colors.fill, borderColor: colors.divider }]}>");
      expect(holiday).toMatch(/switchRow: \{[^}]*borderRadius: radius\.md, borderWidth: StyleSheet\.hairlineWidth, paddingHorizontal: space\.md/);
      expect(holiday).toMatch(/pickerRow: \{[^}]*borderRadius: radius\.md, borderWidth: StyleSheet\.hairlineWidth/);
    });
  });

  describe("Item 3 · FN-8 fade ao encolher a Início", () => {
    const home = squash(read("sheets/HomeSheet.tsx"));

    it("a opacidade vem de homeFadeOpacity e vai à frase e a Registros a conferir", () => {
      expect(home).toContain("opacity: homeFadeOpacity(sheetTop.value, topAtSmall, topAtMedium)");
      expect(home).toMatch(/<Animated\.View entering=\{[^}]*\} style=\{fadeStyle\}> <HomePhrase/);
      expect(home).toMatch(/\{pendingInfo \? \( <Animated\.View style=\{fadeStyle\}/);
    });

    it("o bloco invisível sai do toque e da leitura", () => {
      expect(home).toContain('pointerEvents={state.detent === 0 ? "none" : "auto"}');
      expect(home).toMatch(/pointerEvents=\{state\.detent === 0 \? "none" : "auto"\} accessibilityElementsHidden=\{state\.detent === 0\}/);
    });
  });

  describe("Item 4 · FN-9 soltura da alça", () => {
    const edit = squash(read("sheets/LineEditSheet.tsx"));

    it("as duas saídas do gesto animam com a mola constante", () => {
      expect(edit).toContain("translateY.value = reduceMotion ? 0 : withSpring(0, DROP_SPRING); } };");
      expect(edit).toMatch(/\.onFinalize\(\(\) => \{ translateY\.value = reduceMotion \? 0 : withSpring\(0, DROP_SPRING\);/);
    });

    it("a linha solta mostra o deslocamento da soltura somado ao da mola", () => {
      expect(edit).toContain("{ translateY: translateY.value + animatedY }");
      expect(edit).toContain("translateY.value = releaseStart(translationY, row.index, target, rowHeight);");
    });
  });
});
