/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 16 (Registros por viagem):
 * Item 3: A lista na RecordsSheet.
 * Item 4: A página da viagem, dentro da folha.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const recordsSheet = squash(read("sheets/RecordsSheet.tsx"));

describe("e085Bloco16Wiring (Item 3: A lista na RecordsSheet)", () => {
  it("3a: a folha chama buildTripsList com observations, rides, snapshot, now e windowDays", () => {
    expect(recordsSheet).toMatch(
      /buildTripsList\(\{\s*observations:\s*liveObservations,\s*rides:\s*registro\.rides,\s*snapshot:\s*scheduleData,\s*now:\s*instant,\s*windowDays,?\s*\}\)/,
    );
  });

  it("3b: model.now alimenta o cartão 'Agora'", () => {
    expect(recordsSheet).toMatch(/if\s*\(\s*model\.now\s*\)|model\.now\s*\?|model\.now\s*&&/);
    expect(recordsSheet).toMatch(/title:\s*t\("sheet_records\.section\.now"\)/);
  });

  it("3c: o cartão de viagem abre a página com o boardingId", () => {
    expect(recordsSheet).toMatch(
      /dispatchNav\(\{\s*type:\s*"open",\s*boardingId:\s*card\.boardingId\s*\}\)/,
    );
  });

  it("3d: 'Conferir' usa rowTarget e 'Não sei' chama registro.dismissReview(row.id)", () => {
    expect(recordsSheet).toMatch(/dispatch\(\{\s*type:\s*"push",\s*sheet:\s*rowTarget\(row\)\s*\}\)/);
    expect(recordsSheet).toMatch(/registro\.dismissReview\(row\.id\)/);
  });

  it("3e: model.allChecked decide o cartão 'Tudo conferido'", () => {
    expect(recordsSheet).toMatch(
      /else\s+if\s*\(\s*model\.allChecked\s*\)|if\s*\(\s*model\.allChecked\s*\)|model\.allChecked\s*\?/,
    );
    expect(recordsSheet).toMatch(/t\("sheet_records\.allchecked\.headline"\)/);
  });

  it("3f: o deslizar do cartão de viagem chama registro.remove(card.boardingId)", () => {
    expect(recordsSheet).toMatch(/onDelete=\{handleDeleteTrip\}/);
    expect(recordsSheet).toMatch(/handleDeleteTrip\s*=\s*useCallback\([\s\S]*?registro\.remove\(boardingId\)/);
  });

  it("3g: o deletedIds recebe boardingId e alightingId", () => {
    expect(recordsSheet).toMatch(
      /setDeletedIds\([\s\S]*?add\(boardingId\)[\s\S]*?if\s*\(\s*alightingId\s*\)\s*next\.add\(alightingId\)/,
    );
  });

  it("3h: o 'Agora' não tem renderRightActions (cartão sem deslizar)", () => {
    expect(recordsSheet).toMatch(
      /renderRightActions=\{!isNow\s*\?\s*renderRightActions\s*:\s*undefined\}|!isNow\s*\?\s*\(\s*<ReanimatedSwipeable[\s\S]*?renderRightActions=\{renderRightActions\}/,
    );
  });
});
