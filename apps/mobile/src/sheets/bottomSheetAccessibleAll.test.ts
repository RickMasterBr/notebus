import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (Q-96, regressoes.md §3 lacuna 2): o container do BottomSheet é "ajustável" por padrão e o
// VoiceOver lê a gaveta inteira como um botão só. Em vez da lista fixa de `bottomSheetAccessible.test.ts` (2 arquivos),
// varre todo `.tsx` de sheets/ e screens/ que tenha `<BottomSheet` (sem sufixo) e exige `accessible={false}`.
// Não prova o VoiceOver (só o iPhone prova).

// A tag abre em `<BottomSheet` e fecha num `>` sozinho na linha (os props têm `=>` dentro).
export function bottomSheetOpenTags(source: string): string[] {
  return [...source.matchAll(/(?<![\w<])<BottomSheet(?=[\s>])[\s\S]*?\n\s*>/g)].map((m) => m[0]);
}

/** Quantos `<BottomSheet ...>` do texto não têm `accessible={false}`. */
export function bottomSheetsMissingAccessibleFalse(source: string): number {
  return bottomSheetOpenTags(source).filter((tag) => !tag.includes("accessible={false}")).length;
}

const files = ["sheets", "screens"].flatMap((dir) =>
  readdirSync(join(__dirname, "..", dir))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ file: `${dir}/${f}`, source: readFileSync(join(__dirname, "..", dir, f), "utf8") })),
);
const withBottomSheet = files.filter((f) => bottomSheetOpenTags(f.source).length > 0);

describe("bottomSheetAccessibleAll", () => {
  it("encontra as folhas que declaram <BottomSheet", () => {
    expect(withBottomSheet.length).toBeGreaterThanOrEqual(2);
  });

  for (const { file, source } of withBottomSheet) {
    it(`${file}: todo <BottomSheet> tem accessible={false}`, () => {
      expect(bottomSheetsMissingAccessibleFalse(source)).toBe(0);
    });
  }

  it("prova: um <BottomSheet> sem o prop falha", () => {
    const bad = `<BottomSheet\n  ref={ref}\n  index={0}\n>\n  <View />\n</BottomSheet>`;
    expect(bottomSheetsMissingAccessibleFalse(bad)).toBe(1);
  });

  it("prova: com o prop passa", () => {
    const good = `<BottomSheet\n  ref={ref}\n  accessible={false}\n  index={0}\n>\n  <View />\n</BottomSheet>`;
    expect(bottomSheetsMissingAccessibleFalse(good)).toBe(0);
  });
});
