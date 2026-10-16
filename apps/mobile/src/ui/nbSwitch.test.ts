import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

describe("NbSwitch (E-09 bloco 22, FN-23)", () => {
  it("altura visual mais a folga do hitSlop dá no mínimo 44 pt", () => {
    const src = read("./NbSwitch.tsx");
    const num = (name: string) => Number(new RegExp("export const " + name + " = ([0-9]+);").exec(src)?.[1]);
    expect(num("NB_SWITCH_HEIGHT")).toBe(31);
    expect(num("NB_SWITCH_HEIGHT") + 2 * num("NB_SWITCH_HIT_SLOP")).toBeGreaterThanOrEqual(44);
  });
  it("é um Pressable com role switch, estado checked e onPress que inverte", () => {
    const src = read("./NbSwitch.tsx");
    expect(src).toMatch(/<Pressable[^>]*accessibilityRole="switch"/);
    expect(src).toMatch(/<Pressable[^>]*accessibilityState=\{\{ checked: value \}\}/);
    expect(src).toMatch(/<Pressable[^>]*onPress=\{\(\) => onValueChange\(!value\)\}/);
    expect(src).toContain("hitSlop={{ top: NB_SWITCH_HIT_SLOP, bottom: NB_SWITCH_HIT_SLOP }}");
    expect(src).toContain("<AnimatedSwitchVisual on={value} offColor={colors.switchTrackOff} />");
  });
  it("AnimatedSwitchVisual continua usando colors.divider por padrão (o RecordSheet não muda)", () => {
    expect(read("./AnimatedSwitchVisual.tsx")).toContain("offColor ?? colors.divider");
  });
});
