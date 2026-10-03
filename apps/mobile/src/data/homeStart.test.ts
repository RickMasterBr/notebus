import { describe, expect, it } from "vitest";
import { NEARBY_MAX, initialDetent, nearbyIds } from "./homeStart";

describe("initialDetent (D-141)", () => {
  it("sem recentes: pequeno", () => expect(initialDetent(0)).toBe(0));
  it("com um recente: médio", () => expect(initialDetent(1)).toBe(1));
  it("com a lista cheia: médio", () => expect(initialDetent(10)).toBe(1));
});

describe("nearbyIds (D-144)", () => {
  it("mostra só os 3 primeiros, na ordem", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(NEARBY_MAX).toBe(3);
    expect(nearbyIds(ids)).toEqual(["a", "b", "c"]);
  });
  it("com menos de 3, mostra todos", () => expect(nearbyIds(["a"])).toEqual(["a"]));
  it("lista vazia: nada", () => expect(nearbyIds([])).toEqual([]));
  it("não altera a lista de entrada", () => {
    const ids = ["a", "b", "c", "d"];
    nearbyIds(ids);
    expect(ids).toHaveLength(4);
  });
});
