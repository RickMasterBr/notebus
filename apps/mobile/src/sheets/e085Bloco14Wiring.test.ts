/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 14:
 * Item 1: StopEditSheet usa afterCreateActions, stopPick.resolve e initialName;
 *         SearchSheet empilha stopEdit com NEW_STOP_ID, initialName e afterSave.
 * Item 3: SearchSheet consome searchEmpty e EmptyState;
 *         RecordsSheet usa EmptyState com handleOpenBoard;
 *         PlacesSheet usa EmptyState com kind: "place";
 *         AlarmsSheet usa EmptyState e alarmsEmpty com ações corretas;
 *         NetworkSheet usa networkEmpty e não põe botão no vazio.
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

const stopEditSheet = squash(read("sheets/StopEditSheet.tsx"));
const searchSheet = squash(read("sheets/SearchSheet.tsx"));
const recordsSheet = squash(read("sheets/RecordsSheet.tsx"));
const placesSheet = squash(read("sheets/PlacesSheet.tsx"));
const alarmsSheet = squash(read("sheets/AlarmsSheet.tsx"));
const networkSheet = squash(read("sheets/NetworkSheet.tsx"));

describe("e085Bloco14Wiring (Item 1)", () => {
  it("o StopEditSheet usa afterCreateActions(, stopPick.resolve( e o initialName no rascunho", () => {
    expect(stopEditSheet).toContain("afterCreateActions(");
    expect(stopEditSheet).toContain("stopPick.resolve(");
    expect(stopEditSheet).toContain("initialName");
    expect(stopEditSheet).toMatch(/name:\s*initialName/);
  });

  it("o SearchSheet empilha kind: 'stopEdit' com stopId: NEW_STOP_ID, initialName e afterSave", () => {
    expect(searchSheet).toMatch(
      /kind:\s*"stopEdit",\s*stopId:\s*NEW_STOP_ID,\s*initialName:\s*term\.trim\(\),\s*afterSave:\s*pick \? "pick" : "open"/,
    );
  });
});

describe("e085Bloco14Wiring (Item 3)", () => {
  it("a SearchSheet consome searchEmpty( e usa EmptyState", () => {
    expect(searchSheet).toContain("searchEmpty(");
    expect(searchSheet).toContain("<EmptyState");
  });

  it("o Limpar busca da SearchSheet esvazia o campo e foca o input", () => {
    expect(searchSheet).toMatch(
      /secondary=\{\{\s*label:\s*t\("search\.no_results\.clear"\),\s*onPress:\s*\(\)\s*=>\s*\{\s*setTerm\(""\);\s*input\.current\?\.focus\(\);/,
    );
  });

  it("o RecordsSheet usa EmptyState com handleOpenBoard", () => {
    expect(recordsSheet).toContain("<EmptyState");
    expect(recordsSheet).toContain("onPress: handleOpenBoard");
  });

  it("o PlacesSheet usa EmptyState abrindo folha place (não places)", () => {
    expect(placesSheet).toContain("<EmptyState");
    expect(placesSheet).toContain('sheet: { kind: "place" }');
    expect(placesSheet).not.toMatch(/EmptyState[\s\S]*?sheet:\s*\{\s*kind:\s*"places"\s*\}/);
  });

  it("o AlarmsSheet usa EmptyState e alarmsEmpty( com ação correspondente", () => {
    expect(alarmsSheet).toContain("<EmptyState");
    expect(alarmsSheet).toContain("alarmsEmpty(");
    expect(alarmsSheet).toMatch(
      /alarmsEmpty\([^)]*\)\s*===\s*"places"[\s\S]*?kind:\s*"places"[\s\S]*?kind:\s*"place"/,
    );
  });

  it("o NetworkSheet usa networkEmpty( e não põe botão no vazio (só message)", () => {
    expect(networkSheet).toContain("networkEmpty(");
    // O bloco de item.type === "empty" continua só com Text e message
    const emptyBlockMatch = networkSheet.match(/if \(item\.type === "empty"\) \{ return \(([\s\S]*?)\); \}/);
    expect(emptyBlockMatch, "bloco if empty encontrado").not.toBeNull();
    const emptyBlock = emptyBlockMatch![1]!;
    expect(emptyBlock).toContain("{item.message}");
    expect(emptyBlock).not.toContain("<Pressable");
    expect(emptyBlock).not.toContain("<Button");
    expect(emptyBlock).not.toContain("onPress");
  });
});


