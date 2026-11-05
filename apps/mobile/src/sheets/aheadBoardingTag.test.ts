import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type SheetContent, activeSheet, initialSheetState, sheetReducer } from "./stack";

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8").replace(/\s+/g, " ");
const push = (s: ReturnType<typeof sheetReducer>, sheet: SheetContent) => sheetReducer(s, { type: "push", sheet });
const base = { kind: "ahead", tripId: "t1", position: 3 } as const;

describe("aheadBoardingTag (ideia 69): embarque vs você", () => {
  it("sameSheet distingue ahead que só difere em viaGoto; ausente vale false", () => {
    const a = push(initialSheetState, base);
    expect(push(a, { ...base, viaGoto: true }).stack).toHaveLength(a.stack.length + 1);
    expect(push(a, { ...base, viaGoto: false }).stack).toHaveLength(a.stack.length);
    const b = push(initialSheetState, { ...base, viaGoto: true });
    expect(push(b, { ...base, viaGoto: true }).stack).toHaveLength(b.stack.length);
    expect(activeSheet(b)).toMatchObject({ viaGoto: true });
  });

  it("GotoSheet empurra viaGoto: true; SheetHost repassa; AheadSheet usa a chave nova", () => {
    expect(read("sheets/GotoSheet.tsx")).toContain('kind: "ahead", tripId, position, viaGoto: true');
    expect(read("sheets/SheetHost.tsx")).toContain("viaGoto={entry.viaGoto}");
    expect(read("sheets/AheadSheet.tsx")).toContain("terminal_detail.boarding_here");
    expect(read("data/aheadText.ts")).toContain("terminal_detail.boarding_here");
  });

  it("a chave existe com o texto embarque e você não mudou", () => {
    const ptbr = read("i18n/pt-BR.ts");
    expect(ptbr).toContain('"terminal_detail.boarding_here": "embarque"');
    expect(ptbr).toContain('"terminal_detail.you_are_here": "você"');
  });

  it("o Ponto (StopSheet) continua sem viaGoto", () => {
    expect(read("sheets/StopSheet.tsx")).not.toContain("viaGoto");
  });
});
