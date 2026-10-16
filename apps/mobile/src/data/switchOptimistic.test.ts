import { describe, expect, it } from "vitest";
import { nextSwitchValue, optimisticIdle, requestValue, settle, shownValue } from "./switchOptimistic";

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

  describe("nextSwitchValue (FN-23)", () => {
    it("com pending nulo inverte saved", () => {
      expect(nextSwitchValue(false, optimisticIdle)).toBe(true);
      expect(nextSwitchValue(true, optimisticIdle)).toBe(false);
    });

    it("com pending inverte pending independentemente de saved", () => {
      expect(nextSwitchValue(false, { pending: true, seq: 1 })).toBe(false);
      expect(nextSwitchValue(true, { pending: false, seq: 1 })).toBe(true);
    });

    it("dois toques seguidos voltam ao valor de partida", () => {
      const saved = false;
      const v1 = nextSwitchValue(saved, optimisticIdle);
      expect(v1).toBe(true);
      const s1 = requestValue(optimisticIdle, v1);
      const v2 = nextSwitchValue(saved, s1);
      expect(v2).toBe(false);
      const s2 = requestValue(s1, v2);
      expect(shownValue(saved, s2)).toBe(false);
    });
  });
});
