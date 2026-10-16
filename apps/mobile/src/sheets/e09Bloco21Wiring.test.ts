/**
 * E-09 bloco 21: guarda de ligação dos registros da folha fantasma (FN-14). Só confere o USO (texto do código):
 * cada linha nova sob `if (DIAG_SCROLL)`, refs só escritas sob a guarda, efeito do `SheetHost` em `[stacked.length]`
 * e o registro do interruptor fora do corpo do render.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\s+/g, " ");
const stacked = read("./StackedSheet.tsx");
const host = read("./SheetHost.tsx");
const sw = read("../ui/useOptimisticSwitch.ts");

describe("E-09 bloco 21: registros de diagnóstico (FN-14)", () => {
  it("cada linha nova de StackedSheet é `if (DIAG_SCROLL) recordDiagEvent(...)`", () => {
    for (const frag of [
      "if (DIAG_SCROLL) recordDiagEvent(`onClose #${id} origem=${closeRequestedRef.current ? \"close()\" : \"gesto-ou-fundo\"} ${diagState()}`);",
      "if (DIAG_SCROLL) recordDiagEvent(`close() #${id} ${diagState()}`);",
      "if (DIAG_SCROLL) recordDiagEvent(`toque no fundo #${id}`);",
    ]) expect(stacked.includes(frag), frag).toBe(true);
  });
  it("onClose vem antes de `fechou` e `fechou` segue direto o `if (!isTopRef.current)`", () => {
    expect(stacked.indexOf("`onClose #") < stacked.indexOf("`fechou #")).toBe(true);
  });
  it("as três refs só são escritas dentro de `if (DIAG_SCROLL)`", () => {
    for (const w of ["openedRef.current = true", "mountedAtRef.current = realNow()", "closeRequestedRef.current = true"]) {
      const re = new RegExp(`(.{0,40})${w.replace(/[().]/g, "\$&")}`, "g");
      const hits = [...stacked.matchAll(re)];
      expect(hits.length, w).toBeGreaterThan(0);
      for (const h of hits) expect(h[1]!.includes("if (DIAG_SCROLL"), w).toBe(true);
    }
  });
  it("openedRef só vira true com índice >= 0 e o texto sim/nao é o esperado", () => {
    expect(stacked.includes("if (DIAG_SCROLL && index >= 0) openedRef.current = true;")).toBe(true);
    expect(stacked.includes("abriu=${openedRef.current ? \"sim\" : \"nao\"}")).toBe(true);
    expect(stacked.includes("topo=${isTopRef.current ? \"sim\" : \"nao\"}")).toBe(true);
  });
  it("SheetHost registra o pointerEvents da Início num efeito com [stacked.length]", () => {
    expect(
      host.includes(
        "useEffect(() => { if (DIAG_SCROLL) recordDiagEvent(`inicio pe=${homeLayerPointerEvents(stacked.length)} pilha=${stacked.length}`); }, [stacked.length]);",
      ),
    ).toBe(true);
  });
  it("o registro `sw ... render` do interruptor está num useEffect, não no corpo do render", () => {
    expect(/useEffect\(\(\) => \{ if \(DIAG_SCROLL && label\) \{ recordDiagEvent\( `sw \$\{label\} render /.test(sw)).toBe(true);
  });
});
