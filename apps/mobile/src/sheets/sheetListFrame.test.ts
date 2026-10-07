import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (D-150, regressoes.md §3 lacuna 1): a rolagem de folha só funciona dentro do quadro: a lista numa
// `View` de altura fixa (`height: scrollAreaHeight, overflow: "hidden"`), sem `BottomSheetView` como casca e sem `tall`.
// Fora disso a lista cresce até o fim do conteúdo, perde a rolagem ou a última linha fica cortada. Só varre texto: o
// comportamento na tela só o iPhone prova. Modelo do quadro: `VerifySheet` e `RecordsSheet`.

// Exceções (um arquivo por linha, com o motivo):
const EXCEPTIONS: Record<string, string[]> = {
  // Busca: folha alta com campo de texto (o teclado não pode empurrar a folha), feita assim desde a E-02.
  "SearchSheet.tsx": ["tall", "frame"],
  // A casca da folha: é ela que define `BottomSheetView` e o `tall`.
  "StackedSheet.tsx": ["shell"],
};

const FRAME = /height:\s*scrollAreaHeight,\s*overflow:\s*"hidden"/;
const SCROLL_TAG = /<BottomSheet(?:ScrollView|FlatList)(?=[\s>])/;

export type FrameProblem = "list_without_frame" | "bottom_sheet_view" | "tall";

/** Os problemas de estrutura de rolagem de um arquivo `.tsx` de folha ou tela. */
export function sheetListFrameProblems(source: string): FrameProblem[] {
  const problems: FrameProblem[] = [];
  const scroll = SCROLL_TAG.exec(source);
  if (scroll && !FRAME.test(source.slice(0, scroll.index))) problems.push("list_without_frame");
  if (/<BottomSheetView(?=[\s>])/.test(source)) problems.push("bottom_sheet_view");
  if (/<StackedSheet\b[^>]*?\btall\b/.test(source)) problems.push("tall");
  return problems;
}

const FRAME_DIRS = ["sheets", "screens"].map((dir) => join(__dirname, "..", dir));
const tsxFiles = FRAME_DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => ({ file: f, path: join(dir, f) })));

describe("sheetListFrame", () => {
  it("varre os .tsx de sheets/ e screens/", () => {
    expect(tsxFiles.length).toBeGreaterThan(15);
  });

  for (const { file, path } of tsxFiles) {
    it(`${file}: a lista fica no quadro D-150 (altura fixa, sem BottomSheetView, sem tall)`, () => {
      const skipped = EXCEPTIONS[file] ?? [];
      const found = sheetListFrameProblems(readFileSync(path, "utf8")).filter((p) => {
        if (skipped.includes("shell")) return false;
        if (p === "tall") return !skipped.includes("tall");
        if (p === "list_without_frame") return !skipped.includes("frame");
        return true;
      });
      expect(found).toEqual([]);
    });
  }

  it("prova: a lista sem a View de altura fixa falha", () => {
    const bad = `<StackedSheet id={id} detents={DETENTS}>\n<BottomSheetScrollView>\n</BottomSheetScrollView>\n</StackedSheet>`;
    expect(sheetListFrameProblems(bad)).toEqual(["list_without_frame"]);
  });

  it("prova: BottomSheetView como casca falha", () => {
    expect(sheetListFrameProblems(`<BottomSheetView>\n<Lista />\n</BottomSheetView>`)).toEqual(["bottom_sheet_view"]);
  });

  it("prova: o prop tall falha", () => {
    expect(sheetListFrameProblems(`<StackedSheet id={id} tall>\n</StackedSheet>`)).toEqual(["tall"]);
  });

  it("prova: o quadro D-150 completo passa", () => {
    const good = `<StackedSheet id={id} detents={DETENTS}>\n<View collapsable={false} style={{ height: scrollAreaHeight, overflow: "hidden" }}>\n<BottomSheetScrollView>\n</BottomSheetScrollView>\n</View>\n</StackedSheet>`;
    expect(sheetListFrameProblems(good)).toEqual([]);
  });
});
