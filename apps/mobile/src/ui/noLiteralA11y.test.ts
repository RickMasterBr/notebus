import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function getTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

// Lista de exceções justificadas (se houver alguma no futuro):
// No momento atual, todos os componentes usam t(...) ou variáveis dinâmicas.
const ALLOWED_EXCEPTIONS = new Set<string>();

export function findLiteralA11yViolations(source: string): string[] {
  const violations: string[] = [];
  const regex = /\baccessibility(Label|Hint)\s*=\s*/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(source)) !== null) {
    const attrName = "accessibility" + m[1];
    const idx = regex.lastIndex;
    const firstChar = source[idx];

    if (firstChar === '"' || firstChar === "'") {
      const quote = firstChar;
      const endQuote = source.indexOf(quote, idx + 1);
      const strVal = source.slice(idx + 1, endQuote);
      if (/[a-zA-Z\u00C0-\u017F]/.test(strVal)) {
        violations.push(`${attrName} com literal de texto: "${strVal}"`);
      }
      regex.lastIndex = endQuote + 1;
    } else if (firstChar === "{") {
      let depth = 0;
      let inTemplate = false;
      let endIdx = idx;

      for (let i = idx; i < source.length; i++) {
        const ch = source[i];
        if (ch === "`" && source[i - 1] !== "\\") {
          inTemplate = !inTemplate;
        } else if (!inTemplate) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }

      const expr = source.slice(idx + 1, endIdx).trim();
      regex.lastIndex = endIdx + 1;

      // 1. Template string: {`...`}
      if (expr.startsWith("`") && expr.endsWith("`")) {
        const tmpl = expr.slice(1, -1);
        // Remove expressões interpoladas ${...}
        const literalParts = tmpl.replace(/\$\{[\s\S]*?\}/g, "");
        if (/[a-zA-Z\u00C0-\u017F]/.test(literalParts)) {
          violations.push(`${attrName} com texto fixo em template string: \`${tmpl}\``);
        }
      }

      // 2. String literal em expressão: {"..."} ou {'...'}
      if (
        (expr.startsWith('"') && expr.endsWith('"')) ||
        (expr.startsWith("'") && expr.endsWith("'"))
      ) {
        const text = expr.slice(1, -1);
        if (/[a-zA-Z\u00C0-\u017F]/.test(text)) {
          violations.push(`${attrName} com literal de texto entre chaves: ${expr}`);
        }
      }
    }
  }

  return violations;
}

describe("noLiteralA11y", () => {
  it("nenhum accessibilityLabel ou accessibilityHint em sheets, screens e ui usa texto literal ou template string fixa", () => {
    const mobileSrc = join(__dirname, "..");
    const dirs = [
      join(mobileSrc, "sheets"),
      join(mobileSrc, "screens"),
      join(mobileSrc, "ui"),
    ];

    const files = dirs.flatMap(getTsxFiles);
    const violations: { file: string; errors: string[] }[] = [];

    for (const file of files) {
      const fileName = file.split(/[/\\]/).pop() ?? file;
      if (ALLOWED_EXCEPTIONS.has(fileName)) continue;

      const content = readFileSync(file, "utf8");
      const errors = findLiteralA11yViolations(content);

      if (errors.length > 0) {
        violations.push({ file: fileName, errors });
      }
    }

    expect(violations).toEqual([]);
  });

  it("falha com código que contém accessibilityLabel com template string fixa (caso OptionSheet pré-correção)", () => {
    const preFixOptionSheetMock = `
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={\`Linha \${lInfo.code}\`}
        onPress={() => {}}
      />
    `;

    const violations = findLiteralA11yViolations(preFixOptionSheetMock);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("Linha");
  });

  it("falha com código que contém accessibilityLabel com literal direto", () => {
    const rawLiteralMock = `
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={() => {}}
      />
    `;

    const violations = findLiteralA11yViolations(rawLiteralMock);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("Fechar");
  });
});
