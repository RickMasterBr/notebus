/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 13:
 * Item 1: SheetHost passa entry.initialStop para LineEditSheet; LineEditSheet usa initialLineFormState(initialStop).
 * Item 3: HomeSheet consome homeGuide e readHomeGuideFacts; ações line, mobilis e dismiss;
 * ordem na lista do Início; homeCardsPlan intocado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { homeCardsPlan } from "../data/homeCards";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const sheetHost = squash(read("sheets/SheetHost.tsx"));
const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));
const homeSheet = squash(read("sheets/HomeSheet.tsx"));
const homeGuideCard = squash(read("sheets/HomeGuideCard.tsx"));

describe("e085Bloco13Wiring (Item 1)", () => {
  it("o desvio do SheetHost passa entry.initialStop para LineEditSheet", () => {
    expect(sheetHost).toContain(
      'if (entry.kind === "lineDetail" && entry.lineId === NEW_LINE_ID && entry.initialStop) { return <LineEditSheet id={entry.id} initialStop={entry.initialStop} />;'
    );
  });

  it("o LineEditSheet usa initialLineFormState( com o argumento initialStop", () => {
    expect(lineEditSheet).toMatch(/useState<LineFormState>\(\s*\(\)\s*=>\s*initialLineFormState\(initialStop\)\s*\)/);
  });
});

describe("e085Bloco13Wiring (Item 3)", () => {
  it("o HomeSheet consome homeGuide( e readHomeGuideFacts(", () => {
    expect(homeSheet).toContain("homeGuide(");
    expect(homeSheet).toContain("readHomeGuideFacts(");
  });

  it("a ação line empilha lineDetail com NEW_LINE_ID e initialStop", () => {
    expect(homeSheet).toContain(
      'sheet: { kind: "lineDetail", lineId: NEW_LINE_ID, ...(guideFacts?.lastStop ? { initialStop: guideFacts.lastStop } : {}), }'
    );
  });

  it("a ação mobilis empilha kind: 'search'", () => {
    expect(homeSheet).toContain('dispatch({ type: "push", sheet: { kind: "search" } });');
  });

  it("o × chama dismissHomeGuide( e só aparece com dismissible", () => {
    expect(homeSheet).toContain("dismissHomeGuide(db, now())");
    expect(homeSheet).toContain("<HomeGuideCard kind={guideCard.kind} dismissible={guideCard.dismissible}");
    expect(homeGuideCard).toContain("{dismissible ? ( <Pressable");
    expect(homeGuideCard).toContain('accessibilityLabel={t("common.close")}');
    expect(homeGuideCard).toContain("<CrossGlyph");
  });

  it("o cartão fica depois da faixa de atalhos e antes do pendingInfo (ordem de aparição no texto)", () => {
    const posShortcuts = homeSheet.indexOf("shortcutsContainer");
    const posCard = homeSheet.indexOf("<HomeGuideCard");
    const posPending = homeSheet.indexOf("pendingInfo ?");
    expect(posShortcuts).toBeGreaterThan(0);
    expect(posCard).toBeGreaterThan(posShortcuts);
    expect(posPending).toBeGreaterThan(posCard);
  });

  it("o useEffect dos fatos tem dependências [stops.stops.length, schedule, observations.length]", () => {
    const effectMatch = homeSheet.match(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?readHomeGuideFacts[\s\S]*?return\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*\}\s*,\s*\[([^\]]*)\]\s*\)/
    );
    expect(effectMatch, "useEffect com readHomeGuideFacts encontrado").not.toBeNull();
    const deps = (effectMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    expect(deps).toEqual(["stops.stops.length", "schedule", "observations.length"]);
  });

  it("homeCardsPlan não recebe campo novo", () => {
    const plan = homeCardsPlan({
      hasTripCard: false,
      hasBackupReminder: false,
      offerVisible: false,
      offlineStatus: "none",
      measuredHeight: 0,
    });
    expect(Object.keys(plan).sort()).toEqual(["effectiveHeight", "showAny", "showOffline"].sort());
  });
});
