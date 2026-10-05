import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (Q-96): o container do BottomSheet é "ajustável" por padrão e o VoiceOver lê a gaveta
// inteira como um botão só. Cada <BottomSheet ...> precisa desligar isso. Não prova o VoiceOver (só o iPhone prova).
const FILES = ["StackedSheet.tsx", "HomeSheet.tsx"];

// A tag abre em `<BottomSheet` e fecha num `>` sozinho na linha (os props têm `=>` dentro).
function bottomSheetOpenTags(source: string): string[] {
  return [...source.matchAll(/(?<![\w<])<BottomSheet(?=[\s>])[\s\S]*?\n\s*>/g)].map((m) => m[0]);
}

describe("bottomSheetAccessible", () => {
  for (const file of FILES) {
    it(`${file}: todo <BottomSheet> tem accessible={false}, sem papel nem rótulo`, () => {
      const source = readFileSync(join(__dirname, file), "utf8");
      const tags = bottomSheetOpenTags(source);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toContain("accessible={false}");
        expect(tag).toContain("accessibilityRole={null}");
        expect(tag).toContain("accessibilityLabel={null}");
      }
    });
  }
});
