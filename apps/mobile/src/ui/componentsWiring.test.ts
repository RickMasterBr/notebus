import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI_DIR = __dirname;
const COMPONENT_FILES = [
  "MapButton.tsx",
  "GroupedList.tsx",
  "ScreenTopBar.tsx",
  "NoticeCard.tsx",
  "RouteStopRow.tsx",
];

describe("componentsWiring (ligação e isolamento das peças reutilizáveis)", () => {
  it("cada um dos 5 arquivos de peça importa de '../theme' e não contém cores hexadecimais", () => {
    for (const file of COMPONENT_FILES) {
      const fullPath = join(UI_DIR, file);
      const content = readFileSync(fullPath, "utf-8");

      expect(content).toMatch(/from\s+["']\.\.\/theme["']/);
      expect(content).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    }
  });

  it("MapButton contém accessibilityShowsLargeContentViewer e elevation.card", () => {
    const content = readFileSync(join(UI_DIR, "MapButton.tsx"), "utf-8");
    expect(content).toContain("accessibilityShowsLargeContentViewer");
    expect(content).toContain("elevation.card");
  });

  it("ScreenTopBar contém t(\"common.back\"), t(\"common.close\"), topBarShowsBackText( e type.largeTitle", () => {
    const content = readFileSync(join(UI_DIR, "ScreenTopBar.tsx"), "utf-8");
    expect(content).toContain('t("common.back")');
    expect(content).toContain('t("common.close")');
    expect(content).toContain("topBarShowsBackText(");
    expect(content).toContain("type.largeTitle");
  });

  it("NoticeCard não contém backgroundColor: colors.warning nem backgroundColor: colors.danger", () => {
    const content = readFileSync(join(UI_DIR, "NoticeCard.tsx"), "utf-8");
    expect(content).not.toContain("backgroundColor: colors.warning");
    expect(content).not.toContain("backgroundColor: colors.danger");
  });

  it("RouteStopRow contém accessibilityElementsHidden", () => {
    const content = readFileSync(join(UI_DIR, "RouteStopRow.tsx"), "utf-8");
    expect(content).toContain("accessibilityElementsHidden");
  });
});
