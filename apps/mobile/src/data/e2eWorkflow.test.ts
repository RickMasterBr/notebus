/**
 * E-09 bloco 26: guarda do workflow `.github/workflows/e2e.yml`. Nada disto rodou num Mac: o que vale é o texto do
 * arquivo (compilação Release como o `ios.yml`, tamanhos válidos do `simctl`, só disparo manual).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync(new URL("../../../../.github/workflows/e2e.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = text.replace(/^\s*#.*$/gm, "");

/** Nomes aceitos por `xcrun simctl ui <device> content_size`. */
const SIMCTL_CONTENT_SIZES = [
  "extra-small",
  "small",
  "medium",
  "large",
  "extra-large",
  "extra-extra-large",
  "extra-extra-extra-large",
  "accessibility-medium",
  "accessibility-large",
  "accessibility-extra-large",
  "accessibility-extra-extra-large",
  "accessibility-extra-extra-extra-large",
];

describe("E-09 bloco 26: e2e.yml", () => {
  it("o único gatilho é workflow_dispatch", () => {
    const on = /^on:\n((?: {2}.*\n?)+)/m.exec(code)?.[1] ?? "";
    expect(on).toMatch(/^ {2}workflow_dispatch:/m);
    expect(code).not.toMatch(/^\s*push:/m);
    expect(code).not.toMatch(/^\s*pull_request:/m);
    expect(code).not.toMatch(/^\s*schedule:/m);
  });
  it("compila em Release e instala de Release-iphonesimulator", () => {
    expect(code).toMatch(/-configuration Release\b/);
    expect(code).not.toMatch(/-configuration Debug\b/);
    expect(code).toContain("Release-iphonesimulator");
    expect(code).not.toContain("Debug-iphonesimulator");
  });
  it("as duas variáveis de teste estão no env do job", () => {
    const env = /^ {4}env:\n((?: {6}.*\n)+)/m.exec(code)?.[1] ?? "";
    expect(env).toMatch(/EXPO_PUBLIC_NB_NO_NETWORK: "1"/);
    expect(env).toMatch(/EXPO_PUBLIC_NB_TEST_SEED: "1"/);
  });
  it("cada tamanho passado a content_size é um nome válido do simctl", () => {
    const list = /SIZES=\(([^)]*)\)/.exec(code)?.[1] ?? "";
    const sizes = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(sizes.length).toBe(5);
    for (const size of sizes) expect(SIMCTL_CONTENT_SIZES, size).toContain(size);
    expect(code).toMatch(/content_size "\$size"/);
  });
  it("não passa DYNAMIC_TYPE_SIZE ao Maestro (o YAML nunca o usa)", () => {
    expect(text).not.toContain("DYNAMIC_TYPE_SIZE");
  });
});
