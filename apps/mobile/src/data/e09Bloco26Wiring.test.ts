/**
 * E-09 bloco 26: guarda de ligação do `index.ts` (rede bloqueada e semente de teste instaladas antes de registrar o app)
 * e do `minHeight: minTouch` do cartão do ponto. Lê o texto sem comentários.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (url: URL) =>
  readFileSync(url, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\/|(^|[\s;{(,])\/\/.*$/gm, "$1");

const indexLines = strip(new URL("../../index.ts", import.meta.url)).split("\n");
const stopCardView = strip(new URL("../ui/StopCardView.tsx", import.meta.url));

/** Número da linha que é exatamente `call`, começando na coluna 0 (escopo do módulo, não dentro de função); ou -1. */
const lineOf = (call: string) => indexLines.findIndex((l) => l === call);

describe("E-09 bloco 26: index.ts", () => {
  it("importa installNoNetwork do módulo certo", () => {
    const text = indexLines.join("\n");
    expect(text).toMatch(/import \{ installNoNetwork \} from ['"]\.\/src\/data\/noNetwork['"];/);
  });
  it("chama installNoNetwork no escopo do módulo, antes de registerRootComponent(", () => {
    const register = indexLines.findIndex((l) => l.startsWith("registerRootComponent("));
    expect(register, "registerRootComponent").toBeGreaterThanOrEqual(0);
    for (const call of ["installNoNetwork();"]) {
      const at = lineOf(call);
      expect(at, call).toBeGreaterThanOrEqual(0);
      expect(at, `${call} antes de registerRootComponent`).toBeLessThan(register);
    }
  });
});

describe("E-09 bloco 26: StopCardView", () => {
  it("importa minTouch de ../theme e o estilo card tem minHeight: minTouch", () => {
    expect(stopCardView).toMatch(/import \{[^}]*\bminTouch\b[^}]*\} from "\.\.\/theme";/);
    expect(stopCardView).toMatch(/\bcard: \{ minHeight: minTouch,/);
  });
});
