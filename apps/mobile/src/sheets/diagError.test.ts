import { describe, expect, it } from "vitest";
import {
  DIAG_ERROR_COMPONENT_LINES,
  DIAG_ERROR_LINE_MAX,
  DIAG_ERROR_MESSAGE_MAX,
  DIAG_ERROR_STACK_LINES,
  formatDiagError,
} from "./diagError";

describe("formatDiagError", () => {
  it("fixa as constantes de produto", () => {
    expect([DIAG_ERROR_MESSAGE_MAX, DIAG_ERROR_STACK_LINES, DIAG_ERROR_LINE_MAX, DIAG_ERROR_COMPONENT_LINES]).toEqual([
      400, 12, 120, 6,
    ]);
  });

  it("corta a mensagem em 400 caracteres", () => {
    const info = formatDiagError(new Error("x".repeat(1000)));
    expect(info.message).toHaveLength(400);
  });

  it("guarda só as 12 primeiras linhas da pilha, cada uma com no máximo 120 caracteres", () => {
    const error = new Error("falhou");
    error.stack = Array.from({ length: 30 }, (_, i) => `linha${i} ${"y".repeat(300)}`).join("\n");
    const info = formatDiagError(error);
    expect(info.stackLines).toHaveLength(12);
    expect(info.stackLines[0]!.startsWith("linha0 ")).toBe(true);
    expect(info.stackLines[11]!.startsWith("linha11 ")).toBe(true);
    expect(info.stackLines.every((line) => line.length <= 120)).toBe(true);
  });

  it("guarda até 6 linhas da pilha de componentes", () => {
    const stack = Array.from({ length: 20 }, (_, i) => `    at Comp${i}`).join("\n");
    const info = formatDiagError(new Error("a"), stack);
    expect(info.componentLines).toHaveLength(6);
    expect(info.componentLines[0]).toBe("at Comp0");
  });

  it("pilha vazia ou ausente dá listas vazias", () => {
    const error = new Error("sem pilha");
    error.stack = "";
    expect(formatDiagError(error, "").stackLines).toEqual([]);
    expect(formatDiagError(error, null).componentLines).toEqual([]);
    expect(formatDiagError(error).componentLines).toEqual([]);
  });

  it("aceita mensagem que não é string e valores lançados que não são Error", () => {
    expect(formatDiagError({ message: 42 }).message).toBe("[object Object]");
    expect(formatDiagError("texto solto").message).toBe("texto solto");
    expect(formatDiagError(undefined)).toEqual({ message: "undefined", stackLines: [], componentLines: [] });
    expect(formatDiagError(null).message).toBe("null");
  });
});
