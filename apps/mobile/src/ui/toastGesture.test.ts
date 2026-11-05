import { describe, expect, it } from "vitest";
import {
  EXIT_X,
  EXIT_Y,
  toastDismissDirection,
  toastExitOffset,
  toastTop,
} from "./toastGesture";

describe("toastTop (margem superior do toast)", () => {
  it("devolve o maior entre a area segura de cima mais 4 e 12", () => {
    expect(toastTop(59)).toBe(63);
    expect(toastTop(47)).toBe(51);
    expect(toastTop(20)).toBe(24);
    expect(toastTop(8)).toBe(12);
    expect(toastTop(0)).toBe(12);
  });
});

describe("toastDismissDirection (direcao de dispensa por gesto)", () => {
  it("trata todos os casos de arrasto horizontal, vertical e nulo", () => {
    expect(toastDismissDirection({ dx: -50, dy: 5 })).toBe("left");
    expect(toastDismissDirection({ dx: 50, dy: 0 })).toBe("right");
    expect(toastDismissDirection({ dx: 41, dy: 0 })).toBe("right");
    expect(toastDismissDirection({ dx: 40, dy: 0 })).toBeNull();
    expect(toastDismissDirection({ dx: 0, dy: -21 })).toBe("up");
    expect(toastDismissDirection({ dx: 0, dy: -20 })).toBeNull();
    expect(toastDismissDirection({ dx: -41, dy: -60 })).toBe("up");
    expect(toastDismissDirection({ dx: -45, dy: -45 })).toBe("left");
    expect(toastDismissDirection({ dx: 0, dy: 80 })).toBeNull();
    expect(toastDismissDirection({ dx: 5, dy: 5 })).toBeNull();
  });
});

describe("toastExitOffset (deslocamento de saida)", () => {
  it("devolve o deslocamento de saida para cada direcao", () => {
    expect(toastExitOffset("left")).toEqual({ x: -EXIT_X, y: 0 });
    expect(toastExitOffset("right")).toEqual({ x: EXIT_X, y: 0 });
    expect(toastExitOffset("up")).toEqual({ x: 0, y: -EXIT_Y });
  });

  it("constantes de saida definidas", () => {
    expect(EXIT_X).toBe(400);
    expect(EXIT_Y).toBe(120);
  });
});
