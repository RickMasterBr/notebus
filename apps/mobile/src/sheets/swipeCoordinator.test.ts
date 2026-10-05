import { describe, expect, it, vi } from "vitest";
import {
  type Closable,
  closeAndClearSwipeable,
  openSingleSwipeable,
} from "./swipeCoordinator";

describe("swipeCoordinator", () => {
  it("abre primeiro swipeable sem fechar nada", () => {
    const itemA: Closable = { close: vi.fn() };
    const result = openSingleSwipeable(null, itemA);

    expect(result).toBe(itemA);
    expect(itemA.close).not.toHaveBeenCalled();
  });

  it("fecha o item anterior quando outro item vai abrir", () => {
    const itemA: Closable = { close: vi.fn() };
    const itemB: Closable = { close: vi.fn() };

    const result = openSingleSwipeable(itemA, itemB);

    expect(result).toBe(itemB);
    expect(itemA.close).toHaveBeenCalledTimes(1);
    expect(itemB.close).not.toHaveBeenCalled();
  });

  it("não fecha a si mesmo se já estiver aberto", () => {
    const itemA: Closable = { close: vi.fn() };

    const result = openSingleSwipeable(itemA, itemA);

    expect(result).toBe(itemA);
    expect(itemA.close).not.toHaveBeenCalled();
  });

  it("closeAndClearSwipeable fecha o item aberto e retorna null", () => {
    const itemA: Closable = { close: vi.fn() };

    const result = closeAndClearSwipeable(itemA);

    expect(result).toBeNull();
    expect(itemA.close).toHaveBeenCalledTimes(1);
  });

  it("closeAndClearSwipeable retorna null quando nada estava aberto", () => {
    const result = closeAndClearSwipeable(null);
    expect(result).toBeNull();
  });
});
