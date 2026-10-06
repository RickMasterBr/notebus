import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function findDuplicateInterpolations(source: string): { key: string; duplicate: string; line: number }[] {
  const lines = source.split("\n");
  const violations: { key: string; duplicate: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const keyMatch = line.match(/^\s*"([^"]+)"\s*:\s*"(.*)",?\s*$/);
    if (!keyMatch) continue;

    const key = keyMatch[1]!;
    const value = keyMatch[2]!;
    const params = [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]!);

    const seen = new Set<string>();
    for (const param of params) {
      if (seen.has(param)) {
        violations.push({ key, duplicate: param, line: i + 1 });
      }
      seen.add(param);
    }
  }

  return violations;
}

describe("noDuplicateInterpolation", () => {
  it("nenhuma chave em i18n/pt-BR.ts repete o mesmo parâmetro {{nome}} duas vezes na mesma mensagem", () => {
    const ptBrPath = join(__dirname, "pt-BR.ts");
    const content = readFileSync(ptBrPath, "utf8");
    const violations = findDuplicateInterpolations(content);

    expect(violations).toEqual([]);
  });

  it("falha com mensagens que repetem o mesmo parâmetro (casos anteriores de route.option.detail e option.preview.detail)", () => {
    const sampleWithDuplicates = `
      export const ptBR = {
        "route.option.detail": "sair às {{time}} · desce ~{{time}}",
        "option.preview.detail": "no ponto {{time}} · desce ~{{time}}",
      };
    `;

    const violations = findDuplicateInterpolations(sampleWithDuplicates);
    expect(violations).toHaveLength(2);
    expect(violations[0]!.key).toBe("route.option.detail");
    expect(violations[0]!.duplicate).toBe("time");
    expect(violations[1]!.key).toBe("option.preview.detail");
    expect(violations[1]!.duplicate).toBe("time");
  });
});
