/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

export function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

export interface PlaceSheetWiringCheck {
  saveButtonAfterScrollView: boolean;
  saveButtonHasHandleSave: boolean;
  listViewUsesListHeight: boolean;
  footerUsesFooterHeight: boolean;
  callsPlaceFooterHeightWithInset: boolean;
  scrollPaddingDoesNotSumInset: boolean;
}

export function checkPlaceSheetWiring(source: string): PlaceSheetWiringCheck {
  const norm = normalize(source);

  const scrollCloseIdx = norm.indexOf("</BottomSheetScrollView>");
  const savePressableMatch = norm.match(/<Pressable\b[^>]*onPress=\{handleSave\}[^>]*>/);
  const savePressableIdx = savePressableMatch ? norm.indexOf(savePressableMatch[0]) : -1;

  const saveButtonAfterScrollView =
    scrollCloseIdx !== -1 && savePressableIdx !== -1 && savePressableIdx > scrollCloseIdx;

  const saveButtonHasHandleSave =
    /<Pressable\b[^>]*onPress=\{handleSave\}[^>]*>[\s\S]*?t\("common\.save"\)/.test(norm);

  const listViewUsesListHeight =
    norm.includes("placeSheetFrame(") &&
    /<View\b[^>]*style=\{\s*\{\s*height:\s*listHeight,\s*overflow:\s*"hidden"\s*\}\s*\}[^>]*>\s*<BottomSheetScrollView/.test(
      norm,
    );

  const footerUsesFooterHeight =
    /<View\b[^>]*style=\{\s*\[\s*styles\.footer,\s*\{\s*height:\s*footerHeight,\s*borderTopColor:\s*colors\.divider\s*\}\s*\]\s*\}/.test(
      norm,
    ) ||
    /<View\b[^>]*style=\{\s*\[\s*styles\.footer,\s*\{\s*height:\s*footerHeight[^}]*\}\s*\]\s*\}/.test(
      norm,
    ) ||
    /<View\b[^>]*height:\s*footerHeight/.test(norm);

  const callsPlaceFooterHeightWithInset =
    /placeFooterHeight\(\s*\{\s*minTouch,\s*space,\s*bottomInset:\s*insets\.bottom\s*\}\s*\)/.test(
      norm,
    ) ||
    /placeFooterHeight\(\s*\{[^}]*bottomInset:\s*insets\.bottom[^}]*\}\s*\)/.test(norm);

  // O paddingBottom da rolagem deixa de somar insets.bottom e fica só space.lg
  const scrollPaddingDoesNotSumInset =
    !/paddingBottom:\s*insets\.bottom/.test(norm) &&
    /paddingBottom:\s*space\.lg/.test(norm);

  return {
    saveButtonAfterScrollView,
    saveButtonHasHandleSave,
    listViewUsesListHeight,
    footerUsesFooterHeight,
    callsPlaceFooterHeightWithInset,
    scrollPaddingDoesNotSumInset,
  };
}

describe("guarda estático de ligação do PlaceSheet (Item 1)", () => {
  const file = join(__dirname, "PlaceSheet.tsx");
  const source = readFileSync(file, "utf8");

  it("(1) o Pressable com onPress={handleSave} está fora do <BottomSheetScrollView> (depois dele)", () => {
    const checks = checkPlaceSheetWiring(source);
    expect(checks.saveButtonAfterScrollView).toBe(true);
    expect(checks.saveButtonHasHandleSave).toBe(true);
  });

  it("(2) a View da lista usa height: listHeight vindo de placeSheetFrame(", () => {
    const checks = checkPlaceSheetWiring(source);
    expect(checks.listViewUsesListHeight).toBe(true);
  });

  it("(3) o rodapé usa height: footerHeight vindo da mesma chamada", () => {
    const checks = checkPlaceSheetWiring(source);
    expect(checks.footerUsesFooterHeight).toBe(true);
  });

  it("(4) placeFooterHeight( é chamada com bottomInset: insets.bottom", () => {
    const checks = checkPlaceSheetWiring(source);
    expect(checks.callsPlaceFooterHeightWithInset).toBe(true);
  });

  it("(5) o paddingBottom da rolagem não soma mais insets.bottom", () => {
    const checks = checkPlaceSheetWiring(source);
    expect(checks.scrollPaddingDoesNotSumInset).toBe(true);
  });
});
