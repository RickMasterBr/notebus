/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("E-09 Bloco 28 guardas de ligação (e09Bloco28Wiring)", () => {
  describe("Item 1 · NbSwitch em Feriado e Linha", () => {
    it("Feriado: Repete todo ano usa NbSwitch com valor e handler", () => {
      expect(squash(read("sheets/HolidaySheet.tsx"))).toContain(
        '<NbSwitch accessibilityLabel={t("holiday.every_year")} value={recurring} onValueChange={setRecurring}',
      );
    });

    it("Linha: Circular usa NbSwitch e o handler grava isCircular", () => {
      const edit = squash(read("sheets/LineEditSheet.tsx"));
      expect(edit).toContain('<NbSwitch accessibilityLabel={t("line_create.circular")} value={state.isCircular}');
      expect(edit).toMatch(/onValueChange=\{\(val\) => setState\(\(prev\) => \(\{ \.\.\.prev, isCircular: val \}\)\)\}/);
    });

    it("nenhum arquivo de sheets, ui e screens usa o Switch nativo (sem exceções)", () => {
      const offenders: string[] = [];
      for (const dir of ["sheets", "ui", "screens"]) {
        let names: string[] = [];
        try {
          names = readdirSync(join(root, dir));
        } catch {
          continue;
        }
        for (const name of names) {
          if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
          const code = read(`${dir}/${name}`);
          const imports = /import\s*\{[^}]*\bSwitch\b[^}]*\}\s*from\s*"react-native"/.test(code);
          if (imports || /<Switch\b/.test(code)) offenders.push(`${dir}/${name}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
  describe("Item 2 · feedback de pressionado na lista fechada", () => {
    const esperado: Record<string, number> = {
      "sheets/PlaceSheet.tsx": 11,
      "sheets/OptionSheet.tsx": 20,
      "sheets/LineEditSheet.tsx": 11,
      "sheets/StopEditSheet.tsx": 6,
      "sheets/SettingsSheet.tsx": 10,
      "sheets/RecordsSheet.tsx": 13,
      "sheets/SheetHandle.tsx": 1,
      "sheets/AlightPickerSheet.tsx": 2,
      "sheets/LineDetailSheet.tsx": 2,
      "sheets/NetworkSheet.tsx": 10,
      "sheets/PlacesSheet.tsx": 4,
      "sheets/RecordSheet.tsx": 11,
      "sheets/RouteSheet.tsx": 4,
      "sheets/VerifySheet.tsx": 5,
      "sheets/WhySheet.tsx": 1,
    };
    for (const [rel, n] of Object.entries(esperado)) {
      it(`${rel} tem ${n} botão(ões) com pressedStyle`, () => {
        const code = read(rel);
        expect(code).toContain('import { pressedStyle } from "../ui/pressed";');
        expect(code.match(/\(\{ pressed \}\) => \[[^]*?pressedStyle\(pressed[,)]/g)?.length).toBe(n);
      });
    }
  });
  describe("Item 3 · hitSlop até 44 pt, tamanho medido no estilo", () => {
    const count = (code: string, piece: string) => code.split(piece).length - 1;
    const casos: [string, string, number][] = [
      ["sheets/OptionSheet.tsx", "hitSlop={hitSlopToMinTouch(28)} style={({ pressed }) => [styles.rangeToggleBtn", 2],
      ["sheets/OptionSheet.tsx", "hitSlop={{ ...hitSlopToMinTouch(36), left: 5, right: 3 }} style={({ pressed }) => [styles.stepperBtnSmall", 2],
      ["sheets/OptionSheet.tsx", "hitSlop={{ ...hitSlopToMinTouch(36), left: 3, right: 5 }} style={({ pressed }) => [styles.stepperBtnSmall", 2],
      [
        "sheets/OptionSheet.tsx",
        "hitSlop={{ ...hitSlopToMinTouch(28), top: space.xs, bottom: space.xs, left: space.xs, right: space.xs }} style={({ pressed }) => [ styles.lineOption,",
        1,
      ],
      ["sheets/RecordSheet.tsx", "hitSlop={hitSlopToMinTouch(20)} style={({ pressed }) => [styles.alightLink, pressedStyle(pressed)]}", 1],
      ["sheets/RecordSheet.tsx", "hitSlop={{ ...hitSlopToMinTouch(24), left: 4, right: 4 }} style={({ pressed }) => [ styles.modeButton,", 2],
      ["sheets/PlaceSheet.tsx", "hitSlop={hitSlopToMinTouch(24)} style={({ pressed }) => [styles.cancelOriginButton, pressedStyle(pressed)]}", 1],
      ["sheets/GotoSheet.tsx", "hitSlop={hitSlopToMinTouch(28)} style={({ pressed }) => [styles.originSelector,", 1],
    ];
    for (const [rel, piece, n] of casos) {
      it(`${rel}: ${n}x ${piece}`, () => {
        expect(count(squash(read(rel)), piece)).toBe(n);
      });
    }
  });
  describe("Item 4 · locais salvos no topo da Busca", () => {
    const search = squash(read("sheets/SearchSheet.tsx"));

    it("savedPlacesOnSearch recebe term, pick, places.status e places.shortcuts.length", () => {
      expect(search).toContain(
        'savedPlacesOnSearch({ term, pick, placesReady: places.status === "ready", shortcutCount: places.shortcuts.length, })',
      );
    });

    it("o resultado é consumido por .show ? e os atalhos vêm antes do corpo da busca", () => {
      expect(search).toContain("{saved.show ? ( <View>");
      expect(search.indexOf("{saved.show ? ( <View>")).toBeLessThan(search.indexOf("{saved.show ? <View"));
    });

    it("o toque abre o destino como no Início, com o mesmo ícone", () => {
      expect(search).toContain("onPress={() => void openGotoOrNewOption(dispatch, places, place.id)}");
      expect(search).toContain("<PlaceIconGlyph icon={place.icon}");
    });
  });
});
