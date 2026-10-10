import { describe, expect, it } from "vitest";
import { mapTouchPolicy } from "./mapTouchPolicy";

describe("mapTouchPolicy (D-145, D-180)", () => {
  it("detent pequeno (0): fundo some, mapa recebe tudo, toque em ponto abre a folha do ponto", () => {
    const policy = mapTouchPolicy(0);
    expect(policy).toEqual({
      backdropCaptures: false,
      mapTapCollapses: false,
      pointTapOpensSheet: true,
    });
  });

  it("detent médio (1): fundo livre (arrastar/zoom passam), toque simples recolhe, não abre ponto (D-180)", () => {
    const policy = mapTouchPolicy(1);
    expect(policy).toEqual({
      backdropCaptures: false,
      mapTapCollapses: true,
      pointTapOpensSheet: false,
    });
  });

  it("detent grande (2): fundo captura toque e recolhe, mapa não recebe arrasto (D-145)", () => {
    const policy = mapTouchPolicy(2);
    expect(policy).toEqual({
      backdropCaptures: true,
      mapTapCollapses: false,
      pointTapOpensSheet: false,
    });
  });
});
