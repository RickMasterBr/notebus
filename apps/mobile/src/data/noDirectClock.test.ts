/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D-095: um só ponto responde "que horas são" (`data/clock.ts`). Ninguém mais lê o relógio do aparelho.
// Procura `Date.now(` e `new Date()` (sem argumento = "agora"). `new Date(valor)` é conta com uma data já dada, não relógio.
const ALLOWED = new Set([
  "apps/mobile/src/data/clock.ts",
  // Valor padrão de parâmetro; todo chamador do app passa o instante (recentStops, importMobilis). O domínio não importa o app.
  "packages/domain/src/ids.ts",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("relógio injetável", () => {
  it("nada no app nem no domínio lê o relógio do aparelho fora de clock.ts", () => {
    const repo = fileURLToPath(new URL("../../../..", import.meta.url));
    const roots = [join(repo, "apps/mobile/src"), join(repo, "packages/domain/src"), join(repo, "apps/mobile/App.tsx"), join(repo, "apps/mobile/index.ts")];
    const files = roots.flatMap((r) => (statSync(r).isDirectory() ? sourceFiles(r) : [r]));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files
      .map((f) => relative(repo, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /new Date\(\s*\)|Date\.now\(/.test(readFileSync(join(repo, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
