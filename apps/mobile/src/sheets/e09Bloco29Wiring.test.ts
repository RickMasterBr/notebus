/** E-09 bloco 29: guardas de ligação. Confere o USO, texto sem comentários. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clean = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
const settings = clean("./SettingsSheet.tsx");
const stacked = clean("./StackedSheet.tsx");

describe("E-09 bloco 29, item 1: interruptor de Feriados adia a gravação", () => {
  it("Feriados passa { deferCommitMs: SWITCH_ANIM_MS + 30 }", () => {
    expect(settings).toContain(
      'useOptimisticSwitch(prefs.includeMunicipalHolidays, prefs.setIncludeMunicipalHolidays, "feriados", { deferCommitMs: SWITCH_ANIM_MS + 30, })',
    );
  });
  it("avisos não passa opção", () => {
    expect(settings).toContain('useOptimisticSwitch(prefs.alarmsAllowed, handleToggleAlarms, "avisos");');
  });
});

describe("E-09 bloco 29, item 2: o detector mede o que está na tela", () => {
  it("o check mede a ref e o resultado alimenta ghostReason({ measured })", () => {
    expect(stacked).toMatch(/contentView\.measureInWindow\(\(_x, y, _w, height\) =>/);
    expect(stacked).toMatch(/\{ top: y, height \}/);
    expect(stacked).toMatch(/ghostReason\(\{[^}]*\bmeasured\b[^}]*\}\)/);
  });
  it("a ref está nos dois ramos do conteúdo", () => {
    expect(stacked).toContain("<View ref={contentRef} collapsable={false}");
    expect(stacked).toContain("<BottomSheetView {...contentRefProps} collapsable={false}");
    expect(stacked).toContain("{ ref: contentRef }");
  });
});
