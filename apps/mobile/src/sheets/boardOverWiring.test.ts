import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

describe("boardOverWiring (item 8)", () => {
  it("BoardSheet.tsx chama boardStep(, boardOverOptions(, takeBoardOverIntent( e usa ChoiceSheetBody e RouteStopRow", () => {
    const boardSheetPath = join(__dirname, "BoardSheet.tsx");
    const content = readFileSync(boardSheetPath, "utf-8");

    expect(content).toContain("boardStep(");
    expect(content).toContain("boardOverOptions(");
    expect(content).toContain("takeBoardOverIntent(");
    expect(content).toContain("ChoiceSheetBody");
    expect(content).toContain("RouteStopRow");
  });

  it("SheetsContext.tsx trata \"boardOver\"", () => {
    const sheetsContextPath = join(__dirname, "SheetsContext.tsx");
    const content = readFileSync(sheetsContextPath, "utf-8");

    expect(content).toContain('"boardOver"');
  });

  it("handlers.ts chama hasOpenRide(", () => {
    const handlersPath = join(__dirname, "../notifications/handlers.ts");
    const content = readFileSync(handlersPath, "utf-8");

    expect(content).toContain("hasOpenRide(");
  });

  it("as chaves do item 7 existem no catálogo pt-BR", () => {
    const requiredKeys = [
      "board_over.title",
      "board_over.subtitle",
      "board_over.option.alighted",
      "board_over.option.dismiss",
      "board_over.option.review",
      "board_over.back_to_options",
      "board_over.alight.title",
      "board_over.failed",
      "board_over.toast.alighted",
      "board_over.notif.title",
      "board_over.notif.body",
      "common.cancel",
    ];

    for (const key of requiredKeys) {
      expect(key in ptBR, `chave "${key}" deve existir em ptBR`).toBe(true);
      expect((ptBR as any)[key]).toBeTruthy();
    }
  });
});
