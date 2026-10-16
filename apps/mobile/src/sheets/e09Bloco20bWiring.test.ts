/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

describe("E-09 Bloco 20b guardas de ligação da gaveta da Início (e09Bloco20bWiring)", () => {
  const home = read("sheets/HomeSheet.tsx");

  it("o detent pequeno vem da função pura, campo a campo", () => {
    expect(home).toMatch(
      /const small = homeSmallDetent\(\{ handleHeight, cardHeight: cards\.effectiveHeight, pillHeight, insetBottom: insets\.bottom, margin: space\.md, fallback: SMALL_FALLBACK, \}\);/,
    );
  });

  it("os snapPoints usam o valor que espera a gaveta parar, com identidade estável", () => {
    expect(home).toContain('const snapPoints = useMemo(() => [snapSmall, "50%", "90%"], [snapSmall]);');
    expect(home).toMatch(/setSnapSmall\(\(prev\) => nextSnapSmall\(prev, small, top, window\.height, \[topAtMedium, topAtLarge\]\)\);/);
    expect(home).toContain("const top = sheetTop.value;");
    expect(home).toContain("[small, state.detent, window.height, topAtMedium, topAtLarge, sheetTop]");
  });

  it("o fade usa o mesmo detent pequeno dos snapPoints", () => {
    expect(home).toContain("const topAtSmall = window.height - snapSmall;");
  });

  it("a zona morta vale para handle, cartão e pílula (as medidas que entram em small)", () => {
    expect(home).toContain("setCardHeight((prev) => nextPhraseHeight(prev, measured))");
    expect(home).toContain("setPillHeight((prev) => nextPhraseHeight(prev, measured))");
    expect(home).toContain("setHandleHeight((prev) => nextPhraseHeight(prev, measured))");
    expect(home).toContain("<HomeHandle onHeight={onHandleHeight} />");
  });

  it("o evento de layout é lido antes do set (AGENTS.md)", () => {
    expect(home).toContain("const measured = e.nativeEvent.layout.height; setCardHeight");
    expect(home).toContain("const measured = e.nativeEvent.layout.height; setPillHeight");
    expect(home).not.toMatch(/\(prev\) => [^)]*e\.nativeEvent/);
  });

  it("o diagnóstico das medidas e dos snapPoints só roda com DIAG_SCROLL e no máximo a cada 100 ms", () => {
    expect(home).toMatch(/if \(!DIAG_SCROLL\) return; const at = realNow\(\); if \(at - lastMeasuresAt\.current < 100\) return;/);
    expect(home).toMatch(/if \(DIAG_SCROLL\) recordDiagEvent\( `home medidas handle=/);
    expect(home).toMatch(/if \(DIAG_SCROLL\) recordDiagEvent\(`home snapPoints novo small=/);
    const calls = [...home.matchAll(/(.{0,30})recordDiagEvent\(\s*`home (medidas|snapPoints)/g)];
    expect(calls).toHaveLength(2);
    expect(calls.every((m) => /if \(DIAG_SCROLL\) $/.test(m[1] ?? ""))).toBe(true);
  });
});
