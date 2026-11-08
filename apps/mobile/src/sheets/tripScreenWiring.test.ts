import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

const SHEETS_DIR = __dirname;
const MOBILE_SRC = join(SHEETS_DIR, "..");

describe("tripScreenWiring (D-392, D-393)", () => {
  it("SheetHost.tsx desenha trip com TripScreen e não importa mais TripSheet", () => {
    const sheetHostPath = join(SHEETS_DIR, "SheetHost.tsx");
    const code = readFileSync(sheetHostPath, "utf-8");

    expect(code).not.toContain("TripSheet");
    expect(code).toContain("TripScreen");
    expect(code).toMatch(/case\s+"trip":\s*return\s*<TripScreen/);
  });

  it("TripScreen.tsx chama as 7 funções do contrato e usa ScreenTopBar com variant='modal'", () => {
    const tripScreenPath = join(SHEETS_DIR, "TripScreen.tsx");
    const code = readFileSync(tripScreenPath, "utf-8");

    expect(code).toContain("buildAlightList(");
    expect(code).toContain("tripSummary(");
    expect(code).toContain("tripHeader(");
    expect(code).toContain("tripDone(");
    expect(code).toContain("tripProgress(");
    expect(code).toContain("alightRecordTime(");
    expect(code).toContain("useTripAlightChoice(");
    expect(code).toMatch(/ScreenTopBar[\s\S]*?variant="modal"/);
  });

  it("Home.tsx chama presentationOf(", () => {
    const homePath = join(MOBILE_SRC, "screens", "Home.tsx");
    const code = readFileSync(homePath, "utf-8");

    expect(code).toContain("presentationOf(");
  });

  it("todas as 15 chaves do item 9 existem em pt-BR.ts", () => {
    const requiredKeys = [
      "trip.title.arrives",
      "trip.title.ongoing",
      "trip.next_stop",
      "trip.remaining.a11y",
      "trip.choose_alight",
      "trip.change_alight",
      "trip.choose.hint",
      "trip.alight_here",
      "trip.search.placeholder",
      "trip.done",
      "trip.done.late",
      "trip.done.early",
      "trip.boarded",
      "trip.table",
      "trip.usual",
    ];

    for (const key of requiredKeys) {
      expect(key in ptBR).toBe(true);
    }
  });
});
