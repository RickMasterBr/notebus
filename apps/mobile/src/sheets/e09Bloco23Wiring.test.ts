/**
 * E-09 bloco 23: guarda de ligação do detector e do reparo da folha fantasma (FN-14). Só confere o USO (texto do
 * código sem comentários): a regra pura é chamada com o que a biblioteca informa, o resultado de `repairStep` manda,
 * o remonte usa `key={revealKey}` e nenhuma leitura de `.value` fica fora do callback do `setTimeout`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stripped = readFileSync(new URL("./StackedSheet.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
  .replace(/\s+/g, " ");

const CHECK_BLOCK = /const check = \(\) => \{.*?timer = setTimeout\(check, REVEAL_CHECK_MS\); \};/;
const checkBlock = CHECK_BLOCK.exec(stripped)?.[0] ?? "";

describe("E-09 bloco 23: folha fantasma (FN-14)", () => {
  it("o callback do setTimeout existe e é agendado", () => {
    expect(checkBlock.length).toBeGreaterThan(0);
    expect(/timer = setTimeout\(check, REVEAL_CHECK_MS\);/.test(stripped)).toBe(true);
  });
  it("isGhostSuspect recebe isTop e as leituras de animatedPosition/animatedIndex, dentro do callback", () => {
    expect(
      /const suspect = isGhostSuspect\(\{ isTop, hasBeenCovered: true, position, index, screenHeight, expectedIndex \}\);/.test(checkBlock),
    ).toBe(true);
    expect(checkBlock.includes("const position = animatedPosition.value;")).toBe(true);
    expect(checkBlock.includes("const index = animatedIndex.value;")).toBe(true);
    expect(checkBlock.includes("if (!suspect) return;")).toBe(true);
  });
  it("o resultado de repairStep manda: snap reabre pela biblioteca, remount troca a key", () => {
    expect(checkBlock.includes("const step = repairStep(attempt);")).toBe(true);
    expect(checkBlock.includes('if (step === "snap") ref.current?.snapToIndex(expectedIndex, openConfig);')).toBe(true);
    expect(checkBlock.includes('else if (step === "remount") setRevealKey((k) => k + 1);')).toBe(true);
  });
  it("o BottomSheet usa key={revealKey} e só anima ao montar com revealKey === 0", () => {
    expect(/<BottomSheet key=\{revealKey\} ref=\{ref\}/.test(stripped)).toBe(true);
    expect(stripped.includes("animateOnMount={!reduceMotion && revealKey === 0}")).toBe(true);
  });
  it("o BottomSheet recebe animatedPosition e animatedIndex", () => {
    const sheet = stripped.slice(stripped.indexOf("<BottomSheet "));
    expect(sheet.includes("animatedPosition={animatedPosition}")).toBe(true);
    expect(sheet.includes("animatedIndex={animatedIndex}")).toBe(true);
  });
  it("nenhum .value fora do callback do setTimeout", () => {
    const total = stripped.match(/\.value\b/g)?.length ?? 0;
    const inside = checkBlock.match(/\.value\b/g)?.length ?? 0;
    expect(inside).toBe(2);
    expect(total).toBe(inside);
  });
  it("os registros novos ficam atrás de `if (DIAG_SCROLL)` na mesma linha", () => {
    for (const frag of ["recordDiagEvent(`revela #", "recordDiagEvent(`reparo #"]) {
      const at = stripped.indexOf(frag);
      expect(at, frag).toBeGreaterThan(0);
      expect(stripped.slice(at - 17, at), frag).toBe("if (DIAG_SCROLL) ");
    }
  });
});
