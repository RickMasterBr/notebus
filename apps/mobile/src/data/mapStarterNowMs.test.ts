/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Analisa o código-fonte em busca de chamadas a `createMapStarter`
 * e garante que `nowMs` receba uma função (referência ou thunk `() => ...`),
 * e nunca uma chamada direta (`realNow()`, `Date.now()`, `now()`) ou número fixo.
 */
export function findMapStarterNowMsViolations(source: string): string[] {
  const violations: string[] = [];
  // Remove comentários em bloco e de linha para evitar falsos positivos/negativos
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const starterRegex = /\bcreateMapStarter\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = starterRegex.exec(clean)) !== null) {
    const configBody = match[1] ?? "";
    const nowMsMatch = /\bnowMs\s*:\s*([^,}]+)/.exec(configBody);
    if (!nowMsMatch || !nowMsMatch[1]) {
      violations.push("createMapStarter chamado sem propriedade nowMs");
      continue;
    }
    const expr = nowMsMatch[1].trim();

    // Se for arrow function ou function expression, é função válida
    if (/^(\(\s*\)|[a-zA-Z_$][\w$]*)\s*=>/.test(expr) || /^function\b/.test(expr)) {
      continue;
    }

    // Se for uma chamada direta (ex.: realNow(), Date.now(), now(), etc.)
    if (/\b(realNow|Date\.now|now|\w+)\s*\([^)]*\)/.test(expr)) {
      violations.push(
        `createMapStarter recebeu nowMs com chamada direta de função: "${expr}" (esperava função por referência ou thunk)`,
      );
      continue;
    }

    // Se for literal numérico
    if (/^\d+$/.test(expr)) {
      violations.push(
        `createMapStarter recebeu nowMs com número fixo: "${expr}" (esperava função por referência ou thunk)`,
      );
      continue;
    }

    // Se for um identificador simples (como realNow), é função por referência válida
    if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)?$/.test(expr)) {
      continue;
    }

    violations.push(`createMapStarter recebeu nowMs com valor inválido: "${expr}"`);
  }

  return violations;
}

describe("guarda de nowMs no createMapStarter (Item 3)", () => {
  it("MapBackdrop.tsx passa nowMs como função para createMapStarter, nunca como chamada direta", () => {
    const filePath = join(__dirname, "../screens/MapBackdrop.tsx");
    const content = readFileSync(filePath, "utf8");
    const violations = findMapStarterNowMsViolations(content);
    expect(violations).toEqual([]);
  });

  it("falha quando nowMs recebe realNow() com chamada direta", () => {
    const mock = `
      createMapStarter({
        permission: "granted",
        getFix: () => null,
        lastMapPosition: null,
        nowMs: realNow(),
      });
    `;
    const violations = findMapStarterNowMsViolations(mock);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain("chamada direta de função");
    expect(violations[0]).toContain("realNow()");
  });

  it("falha quando nowMs recebe Date.now() ou now()", () => {
    const mockDateNow = `createMapStarter({ nowMs: Date.now() });`;
    expect(findMapStarterNowMsViolations(mockDateNow).length).toBeGreaterThan(0);

    const mockNow = `createMapStarter({ nowMs: now() });`;
    expect(findMapStarterNowMsViolations(mockNow).length).toBeGreaterThan(0);
  });

  it("falha com quebra de linha ou comentário no fim da linha", () => {
    const mockNewline = `
      createMapStarter({
        nowMs:
          realNow(),
      });
    `;
    expect(findMapStarterNowMsViolations(mockNewline).length).toBeGreaterThan(0);

    const mockComment = `
      createMapStarter({
        nowMs: realNow(), // relógio do sistema
      });
    `;
    expect(findMapStarterNowMsViolations(mockComment).length).toBeGreaterThan(0);
  });

  it("aceita função por referência ou arrow function", () => {
    const mockRef = `createMapStarter({ nowMs: realNow });`;
    expect(findMapStarterNowMsViolations(mockRef)).toEqual([]);

    const mockArrow = `createMapStarter({ nowMs: () => realNow() });`;
    expect(findMapStarterNowMsViolations(mockArrow)).toEqual([]);
  });
});
