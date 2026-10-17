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
});
