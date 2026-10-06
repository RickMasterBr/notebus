import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Exceções permitidas e justificadas:
// - SheetHandle.tsx: componente central que implementa o botão ✕ e a barra de arrasto.
const ALLOWED_EXCEPTIONS = new Set(["SheetHandle.tsx"]);

export function checkSingleCloseButton(source: string): {
  hasHandleClose: boolean;
  hasOwnCrossGlyph: boolean;
  violates: boolean;
} {
  // Procura tags <SheetHandle ... />
  const handleMatches = [...source.matchAll(/(?<![\w<])<SheetHandle(?=[\s>])[\s\S]*?\/>/g)];
  let hasHandleClose = false;

  for (const m of handleMatches) {
    const tag = m[0];
    const hasOnCloseProp = /\bonClose\s*=/.test(tag);
    const hasKindCloseWithoutHide =
      /\bkind\s*=\s*["']close["']/.test(tag) && !/\bhideCloseButton\b/.test(tag);

    if (hasOnCloseProp || hasKindCloseWithoutHide) {
      hasHandleClose = true;
      break;
    }
  }

  const hasOwnCrossGlyph = /<CrossGlyph\b/.test(source);
  const violates = hasHandleClose && hasOwnCrossGlyph;

  return { hasHandleClose, hasOwnCrossGlyph, violates };
}

describe("singleCloseButton", () => {
  it("nenhuma folha em sheets/ que usa SheetHandle com fechar desenha CrossGlyph própria", () => {
    const sheetsDir = __dirname;
    const entries = readdirSync(sheetsDir, { withFileTypes: true });
    const violations: string[] = [];

    for (const entry of entries) {
      if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) continue;
      if (ALLOWED_EXCEPTIONS.has(entry.name)) continue;

      const fullPath = join(sheetsDir, entry.name);
      const content = readFileSync(fullPath, "utf8");
      const result = checkSingleCloseButton(content);

      if (result.violates) {
        violations.push(
          `${entry.name}: usa SheetHandle com botão fechar e também desenha <CrossGlyph /> própria`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("falha com código que contém SheetHandle com onClose e CrossGlyph própria (caso GotoSheet pré-correção)", () => {
    const preFixGotoSheetMock = `
      function GotoHandle({ onClose }) {
        return (
          <SheetHandle
            kind="adjustable"
            detent={detent}
            onIncrement={() => snapToIndex(1)}
            onDecrement={() => snapToIndex(0)}
            onClose={onClose}
          />
        );
      }

      export function GotoSheet() {
        return (
          <View>
            <Pressable onPress={close}>
              <CrossGlyph color={colors.textSecondary} />
            </Pressable>
          </View>
        );
      }
    `;

    const result = checkSingleCloseButton(preFixGotoSheetMock);
    expect(result.violates).toBe(true);
    expect(result.hasHandleClose).toBe(true);
    expect(result.hasOwnCrossGlyph).toBe(true);
  });
});
