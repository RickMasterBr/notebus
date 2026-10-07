import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (regressoes.md §3 lacuna 3): `noDuplicateInterpolation.test.ts` ignora a linha que tem comentário
// depois da vírgula (as `// provisório`: 21 das 375 linhas). Aqui a linha com `// ...` no fim também é conferida.

/** Chaves cuja mensagem repete o mesmo `{{nome}}`, aceitando `// ...` depois da vírgula. */
export function findDuplicateInterpolationsCommented(source: string): { key: string; duplicate: string; line: number }[] {
  const out: { key: string; duplicate: string; line: number }[] = [];
  source.split("\n").forEach((text, i) => {
    const m = text.match(/^\s*"([^"]+)"\s*:\s*"(.*)",?\s*(?:\/\/.*)?$/);
    if (!m) return;
    const seen = new Set<string>();
    for (const param of [...m[2]!.matchAll(/\{\{([^}]+)\}\}/g)].map((p) => p[1]!)) {
      if (seen.has(param)) out.push({ key: m[1]!, duplicate: param, line: i + 1 });
      seen.add(param);
    }
  });
  return out;
}

describe("noDuplicateInterpolationCommented", () => {
  it("nenhuma chave de pt-BR.ts repete o mesmo {{nome}}, com ou sem comentário no fim da linha", () => {
    const content = readFileSync(join(__dirname, "pt-BR.ts"), "utf8");
    expect(findDuplicateInterpolationsCommented(content)).toEqual([]);
  });

  it("prova: a linha com comentário depois da vírgula também falha", () => {
    const sample = `  "x": "{{time}} e {{time}}", // provisório`;
    expect(findDuplicateInterpolationsCommented(sample)).toEqual([{ key: "x", duplicate: "time", line: 1 }]);
  });

  it("prova: sem repetição e com comentário passa", () => {
    expect(findDuplicateInterpolationsCommented(`  "y": "{{a}} e {{b}}", // provisório`)).toEqual([]);
  });
});
