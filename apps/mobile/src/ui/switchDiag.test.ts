import { beforeEach, describe, expect, it, vi } from "vitest";

let now = 0;
const record = vi.fn();
vi.mock("../data/clock", () => ({ realNow: () => now }));
vi.mock("../sheets/diagScroll", () => ({ recordDiagEvent: (text: string) => record(text) }));

import { markSwitchEffect, markSwitchRender, markSwitchTap } from "./switchDiag";

describe("switchDiag: resumo do toque ao efeito (E-09 bloco 30)", () => {
  beforeEach(() => {
    record.mockClear();
    now = 1000;
  });

  it("(a) toque, render, efeito: uma linha com toque>render e toque>efeito", () => {
    markSwitchTap("a");
    now = 1030;
    markSwitchRender("a");
    now = 1050;
    markSwitchEffect("a");
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("sw a resumo toque>render=30ms toque>efeito=50ms");
  });

  it("(b) efeito antes do render grava a mesma linha, sem tempo negativo", () => {
    markSwitchTap("b");
    now = 1020;
    markSwitchEffect("b");
    expect(record).not.toHaveBeenCalled();
    now = 1030;
    markSwitchRender("b");
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("sw b resumo toque>render=30ms toque>efeito=20ms");
  });

  it("(c) sem toque marcado, nada é gravado", () => {
    markSwitchRender("c");
    markSwitchEffect("c");
    expect(record).not.toHaveBeenCalled();
  });

  it("(d) a entrada é apagada depois de gravar: um segundo render não grava de novo", () => {
    markSwitchTap("d");
    markSwitchRender("d");
    markSwitchEffect("d");
    markSwitchRender("d");
    markSwitchEffect("d");
    expect(record).toHaveBeenCalledTimes(1);
  });
});
