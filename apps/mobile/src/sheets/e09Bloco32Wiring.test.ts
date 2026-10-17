import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { minTouch, space } from "../theme/tokens";

const option = readFileSync(join(__dirname, "OptionSheet.tsx"), "utf-8").replace(/\s+/g, " ");

describe("E-09 Bloco 32 · selo de linha (lineOption) na folha OptionSheet", () => {
  const hitSlop = /key=\{lId\}.*?hitSlop=\{(\{.*?\})\} style=/.exec(option)?.[1] ?? "";
  const gap = /linesRow: \{[^}]*?gap: space\.(\w+)/.exec(option)?.[1] as keyof typeof space | undefined;
  const slop = /top: space\.(\w+)/.exec(hitSlop)?.[1] as keyof typeof space | undefined;

  it("o hitSlop do lineOption não usa mais o 2 fixo", () => {
    expect(hitSlop).not.toBe("");
    expect(hitSlop).not.toContain("top: 2");
  });

  it("a largura de toque (selo 36 + padding 2x2 + hitSlop) chega a minTouch", () => {
    expect(slop).toBeDefined();
    expect(36 + 4 + 2 * space[slop!]).toBeGreaterThanOrEqual(minTouch);
  });

  it("o hitSlop de dois selos vizinhos não se sobrepõe (2 x hitSlop <= folga)", () => {
    expect(gap).toBeDefined();
    expect(2 * space[slop!]).toBeLessThanOrEqual(space[gap!]);
  });
});
