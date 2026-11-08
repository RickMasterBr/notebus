import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI_DIR = __dirname;
const SRC_DIR = join(__dirname, "..");
const COMPONENT_FILES = [
  "MapButton.tsx",
  "GroupedList.tsx",
  "ScreenTopBar.tsx",
  "NoticeCard.tsx",
  "RouteStopRow.tsx",
];

function getSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) &&
      !entry.name.includes(".test.")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

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

  it("nenhum arquivo de sheets/, screens/ e nav/ importa as 5 peças novas", () => {
    const targetDirs = ["sheets", "screens", "nav"].map((d) => join(SRC_DIR, d));
    const allFiles = targetDirs.flatMap((d) => getSourceFiles(d));
    const componentNames = [
      "MapButton",
      "GroupedList",
      "ScreenTopBar",
      "NoticeCard",
      "RouteStopRow",
    ];

    const violations: { file: string; component: string }[] = [];

    // v1-e2-03 (08/11/2026, autorizado pelo Rick): as telas de registros e os dois botões da Home passam a usar as peças.
    const permitidos = new Set([
      "RecordsScreen.tsx",
      "RecordTripScreen.tsx",
      "PendingAllScreen.tsx",
      "RecordsButton.tsx",
      "SettingsButton.tsx",
    ]);

    for (const filePath of allFiles) {
      if (permitidos.has(filePath.split(/[\\/]/).pop() ?? "")) continue;
      const code = readFileSync(filePath, "utf-8");
      for (const comp of componentNames) {
        const importRegex = new RegExp(`from\\s+["'][^"']*\\b${comp}\\b["']`);
        if (importRegex.test(code)) {
          violations.push({ file: filePath, component: comp });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
