import { describe, expect, it } from "vitest";
import { optimisticIdle, requestValue, settle, shownValue } from "./switchOptimistic";

describe("switchOptimistic (FN-6)", () => {
  it("sem pedido mostra o valor gravado", () => {
    expect(shownValue(true, optimisticIdle)).toBe(true);
    expect(shownValue(false, optimisticIdle)).toBe(false);
  });

  it("pedido mostra o valor pedido na hora, antes da gravação", () => {
    const s = requestValue(optimisticIdle, true);
    expect(shownValue(false, s)).toBe(true);
    expect(shownValue(true, requestValue(optimisticIdle, false))).toBe(false);
  });

  it("sucesso: terminado o pedido, mostra o valor gravado (já novo)", () => {
    const s = requestValue(optimisticIdle, true);
    expect(shownValue(true, settle(s, s.seq))).toBe(true);
  });

  it("falha: terminado o pedido, volta ao valor antigo", () => {
    const s = requestValue(optimisticIdle, true);
    expect(shownValue(false, settle(s, s.seq))).toBe(false);
  });

  it("pedido duplicado: o fim do pedido antigo não apaga o novo", () => {
    const a = requestValue(optimisticIdle, true);
    const b = requestValue(a, false);
    const afterOld = settle(b, a.seq);
    expect(shownValue(true, afterOld)).toBe(false);
    expect(shownValue(true, settle(afterOld, b.seq))).toBe(true);
  });
});
