import { describe, expect, it } from "vitest";
import { toastBottom } from "../data/toastPosition";

describe("F4: toastBottom (posição do toast com e sem teclado)", () => {
  it("sem teclado: usa a área segura de baixo respeitando o mínimo de 12 px", () => {
    // iPhone com home bar: insets.bottom = 34 -> 34 - 6 = 28 px
    expect(toastBottom(0, 34)).toBe(28);
    // Dispositivo sem home bar: insets.bottom = 0 -> Math.max(-6, 12) = 12 px
    expect(toastBottom(0, 0)).toBe(12);
  });

  it("com teclado aberto: fica 12 px acima do teclado", () => {
    // Teclado com 336 pt (típico iOS português)
    expect(toastBottom(336, 34)).toBe(348);
    // Teclado com 291 pt
    expect(toastBottom(291, 34)).toBe(303);
  });
});
