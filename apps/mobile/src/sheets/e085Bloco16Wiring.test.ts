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
  it("3a: a folha chama buildTripsList com observations, rides, snapshot, now e windowDays, e handleLoadMore usa nextWindowDays (R1, R7, R8)", () => {
    expect(recordsSheet).toMatch(
      /buildTripsList\(\{\s*observations:\s*liveObservations,\s*rides:\s*registro\.rides,\s*snapshot:\s*scheduleData,\s*now:\s*instant,\s*windowDays,?\s*\}\)/,
    );
    expect(recordsSheet).toMatch(/useState\(DEFAULT_WINDOW_DAYS\)|useState\(14\)/);
    expect(recordsSheet).toMatch(
      /handleLoadMore\s*=\s*useCallback\([\s\S]*?setWindowDays\(\(curr\)\s*=>\s*nextWindowDays\(model\.hasMore,\s*curr\)\)/,
    );
    expect(recordsSheet).toMatch(/onEndReached=\{handleLoadMore\}/);
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

  it("3f: o deslizar do cartão de viagem chama registro.remove(card.boardingId) e tem rollback com unhide (R2)", () => {
    expect(recordsSheet).toMatch(/onDelete=\{handleDeleteTrip\}/);
    expect(recordsSheet).toMatch(
      /handleDeleteTrip\s*=\s*useCallback\(\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]*?try\s*\{[^}]*?registro\.remove\(boardingId\)[^}]*?\}\s*catch\s*\{[^}]*?unhide\(prev,\s*ids\)[^}]*?\}[\s\S]*?\[registro\]/,
    );
  });

  it("3g: o deletedIds recebe boardingId e alightingId e handleDeleteSingle apaga o ID certo com rollback (R3)", () => {
    expect(recordsSheet).toMatch(
      /idsToHide\(boardingId,\s*alightingId\)[\s\S]*?setDeletedIds\(\(prev\)\s*=>\s*hide\(prev,\s*ids\)\)/,
    );
    expect(recordsSheet).toMatch(
      /handleDeleteSingle\s*=\s*useCallback\(\s*async\s*\(\s*observationId:\s*string\s*\)\s*=>\s*\{[\s\S]*?idsToHide\(observationId\)[\s\S]*?try\s*\{[^}]*?registro\.remove\(observationId\)[^}]*?\}\s*catch\s*\{[^}]*?unhide\(prev,\s*ids\)[^}]*?\}[\s\S]*?\[registro\]/,
    );
    expect(recordsSheet).toMatch(/onDelete=\{handleDeleteSingle\}/);
  });

  it("3h: o 'Agora' não tem renderRightActions nem ação de acessibilidade Apagar (R5/R6)", () => {
    expect(recordsSheet).toMatch(
      /renderRightActions=\{!isNow\s*\?\s*renderRightActions\s*:\s*undefined\}|!isNow\s*\?\s*\(\s*<ReanimatedSwipeable[\s\S]*?renderRightActions=\{renderRightActions\}/,
    );
    expect(recordsSheet).toMatch(
      /accessibilityActions=\{!isNow\s*\?\s*\[\{\s*name:\s*"delete"/,
    );
  });

  it("3i: pruneRevived limpa os IDs vivos no useEffect (R9)", () => {
    expect(recordsSheet).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*setDeletedIds\(\(prev\)\s*=>\s*pruneRevived\(prev,\s*registro\.observations\)\);\s*\},?\s*\[registro\.observations\]\)/,
    );
  });
});

describe("e085Bloco16Wiring (Item 4: A página da viagem, dentro da folha)", () => {
  it("4a: o onPress do RecordsHandle lê recordsHandle(page).press", () => {
    expect(recordsSheet).toMatch(
      /handleInfo\.press === "close" \? onClose : onBack|recordsHandle\(page\)\.press === "close" \? onClose : onBack/,
    );
  });

  it("4b: o ✕ do cabeçalho só aparece se showHeaderClose(page)", () => {
    expect(recordsSheet).toMatch(/showHeaderClose\(page\)\s*&&/);
  });

  it("4c: o botão '‹ Registros' aparece só na página da viagem e não na lista", () => {
    const listPart = recordsSheet.split(/page\.kind === "trip"\s*&&\s*\(\s*<Animated\.View/)[0];
    expect(listPart).not.toMatch(/sheet_records\.back/);
    expect(recordsSheet).toMatch(
      /page\.kind === "trip"\s*&&\s*\(\s*<Animated\.View[\s\S]*?accessibilityLabel=\{t\("sheet_records\.back\.a11y"\)\}/,
    );
  });

  it("4d: 'Apagar viagem' chama registro.remove(tripModel.boarding.id)", () => {
    expect(recordsSheet).toMatch(
      /handleDeleteFromPage\s*=\s*useCallback\([\s\S]*?registro\.remove\(tripModel\.boarding\.id\)[\s\S]*?dispatchNav\(\{\s*type:\s*"back"\s*\}\)/,
    );
  });

  it("4e: 'Editar' do embarque usa o id do embarque", () => {
    expect(recordsSheet).toMatch(
      /sheet:\s*\{\s*kind:\s*"record",\s*observationId:\s*tripModel\.boarding\.id\s*\}[\s\S]*?styles\.editHitTarget/,
    );
  });

  it("4f: 'Conferir' só com verifyId !== null", () => {
    expect(recordsSheet).toMatch(
      /tripModel\.verifyId !== null\s*&&[\s\S]*?kind:\s*"verify",\s*observationId:\s*tripModel\.verifyId/,
    );
  });

  it("4g: o efeito de volta exige page.kind === 'trip' e tripModel === null", () => {
    expect(recordsSheet).toMatch(
      /if\s*\(\s*page\.kind === "trip" && tripModel === null\s*\)\s*\{\s*dispatchNav\(\{\s*type:\s*"back"\s*\}\);\s*\}/,
    );
    expect(recordsSheet).toMatch(/\[page\.kind,\s*tripBoardingId,\s*tripModel === null\]/);
  });

  it("4h: a página usa o quadro D-150 com scrollAreaHeight e overflow hidden", () => {
    expect(recordsSheet).toMatch(
      /page\.kind === "trip"\s*&&[\s\S]*?height:\s*scrollAreaHeight,\s*overflow:\s*"hidden"[\s\S]*?<BottomSheetScrollView/,
    );
  });
});

