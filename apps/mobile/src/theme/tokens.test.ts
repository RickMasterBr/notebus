import { describe, expect, it } from "vitest";
import { colors } from "./tokens";

describe("tema", () => {
  it("claro e escuro têm exatamente as mesmas chaves", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });
  it("valores revisados pela 4.5: D-041 (success saiu, warning claro) e D-067 (trilho do switch)", () => {
    expect("success" in colors.light || "success" in colors.dark).toBe(false);
    expect(colors.light.warning).toBe("#9A5B00");
    expect(colors.dark.warning).toBe("#FFC46B");
    expect(colors.light.danger).toBe("#C62828");
    expect(colors.dark.danger).toBe("#FF8A80");
    expect(colors.light.switchTrackOff).toBe("#8A8A8E");
    expect(colors.dark.switchTrackOff).toBe("#48494D");
  });
  it("tokens do canvas da 4.5 para a folha: pílula, handle e fundo escurecido (D-043: 28% / 50%)", () => {
    expect(colors.light.fill).toBe("#F0F0ED");
    expect(colors.dark.fill).toBe("#2C2D30");
    expect(colors.light.grab).toBe("#C7C7C2");
    expect(colors.dark.grab).toBe("#48494D");
    expect(colors.light.scrim).toBe("rgba(0,0,0,0.28)");
    expect(colors.dark.scrim).toBe("rgba(0,0,0,0.5)");
  });
});
