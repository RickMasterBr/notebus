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
  it("ghostReason recebe isTop e as leituras de animatedPosition/animatedIndex, dentro do callback", () => {
    expect(
      /const reason = ghostReason\(\{ isTop, hasBeenCovered: true, position, index, screenHeight, expectedIndex, measured \}\);/.test(checkBlock),
    ).toBe(true);
    expect(checkBlock.includes("const position = animatedPosition.value;")).toBe(true);
    expect(checkBlock.includes("const index = animatedIndex.value;")).toBe(true);
    expect(checkBlock.includes("if (!suspect) return;")).toBe(true);
  });
  it("o resultado de repairStep manda: snap reabre pela biblioteca, remount troca a key", () => {
    expect(checkBlock.includes('const step = repairStep(attempt, reason ?? "posicao");')).toBe(true);
    expect(checkBlock.includes('if (step === "snap") ref.current?.snapToIndex(expectedIndex, openConfig);')).toBe(true);
    expect(
      checkBlock.includes(
        'else if (step === "remount") { settledIndexRef.current = detents?.initialIndex ?? 0; setRevealKey((k) => k + 1); }',
      ),
    ).toBe(true);
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

  it("o efeito inteiro: cobre, só segue se já foi coberta, depois agenda, e limpa o timer", () => {
    const start = stripped.indexOf("useEffect(() => { if (!isTop) {");
    expect(start, "efeito do detector").toBeGreaterThan(0);
    expect(
      stripped
        .slice(start)
        .startsWith(
          "useEffect(() => { if (!isTop) { hasBeenCoveredRef.current = true; return; } if (!hasBeenCoveredRef.current) return; let timer: ReturnType<typeof setTimeout>; let attempt = 0; const check = () => {",
        ),
    ).toBe(true);
    const tail = "timer = setTimeout(check, REVEAL_CHECK_MS); return () => clearTimeout(timer); }, [";
    expect(stripped.indexOf(tail, start), "agenda e limpa").toBeGreaterThan(start);
  });
  it("REVEAL_CHECK_MS vem de ./ghostRepair (valor fixado no teste da regra)", () => {
    expect(/import \{[^}]*\bREVEAL_CHECK_MS\b[^}]*\} from "\.\/ghostRepair";/.test(stripped)).toBe(true);
    expect(/const REVEAL_CHECK_MS\b/.test(stripped)).toBe(false);
  });
  it("o índice esperado é o último assentado (settledIndexRef), escrito só em callback", () => {
    const handle = /const handleChange = useCallback\(\(index: number\) => \{(.*?)\}, \[onChange\]\);/.exec(stripped)?.[1] ?? "";
    const write = handle.indexOf("settledIndexRef.current = settledIndex(settledIndexRef.current, index);");
    expect(write, "escrita em handleChange").toBeGreaterThanOrEqual(0);
    expect(write).toBeLessThan(handle.indexOf("onChange?.(index)"));
    const decl = checkBlock.indexOf("const expectedIndex = settledIndexRef.current;");
    expect(decl, "leitura em check").toBeGreaterThan(0);
    expect(decl).toBeLessThan(checkBlock.indexOf("const reason = ghostReason("));
    expect(/const expectedIndex = detents/.test(stripped)).toBe(false);
    expect(stripped.includes("const settledIndexRef = useRef(detents?.initialIndex ?? 0);")).toBe(true);
    expect(stripped.match(/settledIndexRef\.current = /g)?.length).toBe(2);
  });
});
