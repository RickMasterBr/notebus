/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 5 (Item 2):
 * Confere o USO no texto-fonte de NetworkSheet.tsx (busca, paginação e botões na lista Pontos).
 * (Rolagem, teclado, toque e VoiceOver só o iPhone decide).
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

const networkSheet = squash(read("sheets/NetworkSheet.tsx"));

describe("E-08.5 bloco 5 guardas de ligação (NetworkSheet.tsx)", () => {
  it("stopsView calculado com useMemo e stopsPageView contíguo", () => {
    expect(networkSheet).toContain(
      "const stopsView = useMemo(() => stopsPageView({ stops, term, page }), [stops, term, page]);",
    );
  });

  it("itera stopsView.items e não stops", () => {
    expect(networkSheet).toContain("for (const stop of stopsView.items) {");
    expect(networkSheet.includes("for (const stop of stops) {")).toBe(false);
  });

  it("linha pinada de cabeçalho e newStop preservada, e stop-search empurrado depois", () => {
    const pinned = 'title: t("net.section.stops"), }); items.push({ type: "newStop", id: "new-stop" });';
    expect(networkSheet).toContain(pinned);

    const pinnedIdx = networkSheet.indexOf(pinned);
    const searchIdx = networkSheet.indexOf('items.push({ type: "stopSearch", id: "stop-search" });');
    expect(searchIdx).toBeGreaterThan(pinnedIdx);
  });

  it("handleTermChange fecha swipeable, atualiza termo e reseta página", () => {
    const match = networkSheet.match(/const handleTermChange = useCallback\(\(text: string\) => \{([^}]*)\}/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain("activeSwipeable.current?.close();");
    expect(body).toContain("setTerm(text); setPage(0);");
  });

  it("handlePrev e handleNext usam stopsView.page (+/- 1) e não usam page cru", () => {
    const prevMatch = networkSheet.match(/const handlePrev = useCallback\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/);
    expect(prevMatch).not.toBeNull();
    expect(prevMatch![1]).toContain("setPage(stopsView.page - 1);");

    const nextMatch = networkSheet.match(/const handleNext = useCallback\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/);
    expect(nextMatch).not.toBeNull();
    expect(nextMatch![1]).toContain("setPage(stopsView.page + 1);");

    expect(networkSheet.match(/setPage\(\s*page\s*[-+]/)).toBeNull();
  });

  it("campo de busca usa BottomSheetTextInput com value={term} e onChangeText={handleTermChange} sem autoFocus", () => {
    const match = networkSheet.match(/<BottomSheetTextInput\s+([^/>]*)\/>/);
    expect(match).not.toBeNull();
    const props = match![1];
    expect(props).toContain("value={term}");
    expect(props).toContain("onChangeText={handleTermChange}");
    expect(props).not.toContain("autoFocus");
  });

  it("botões do pager têm disabled, accessibilityState e onPress correspondentes", () => {
    const prevIdx = networkSheet.indexOf('accessibilityLabel={t("net.stops.page_prev.a11y")}');
    expect(prevIdx).toBeGreaterThan(-1);
    const prevBlock = networkSheet.substring(
      networkSheet.lastIndexOf("<Pressable", prevIdx),
      networkSheet.indexOf("</Pressable>", prevIdx),
    );
    expect(prevBlock).toContain("disabled={!stopsView.hasPrev}");
    expect(prevBlock).toContain("onPress={handlePrev}");

    const nextIdx = networkSheet.indexOf('accessibilityLabel={t("net.stops.page_next.a11y")}');
    expect(nextIdx).toBeGreaterThan(-1);
    const nextBlock = networkSheet.substring(
      networkSheet.lastIndexOf("<Pressable", nextIdx),
      networkSheet.indexOf("</Pressable>", nextIdx),
    );
    expect(nextBlock).toContain("disabled={!stopsView.hasNext}");
    expect(nextBlock).toContain("onPress={handleNext}");
  });

  it("estilo do botão do pager confere minHeight: 44 e minWidth: 44 separadamente", () => {
    const match = networkSheet.match(/pagerButton:\s*\{([^}]*)\}/);
    expect(match).not.toBeNull();
    const style = match![1];
    expect(style).toContain("minHeight: 44");
    expect(style).toContain("minWidth: 44");
  });

  it("BottomSheetFlatList contém keyboardShouldPersistTaps='handled'", () => {
    const listStart = networkSheet.indexOf("<BottomSheetFlatList");
    expect(listStart).toBeGreaterThan(-1);
    const listEnd = networkSheet.indexOf("/>", listStart);
    const listChunk = networkSheet.substring(listStart, listEnd);
    expect(listChunk).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("handlePrev rola até o cabeçalho Pontos e anuncia a nova faixa para VoiceOver", () => {
    const match = networkSheet.match(/const handlePrev = useCallback\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain("scrollToIndex({ index: stopsAnchorIndex(listItems), animated: false })");
    expect(body).toContain("AccessibilityInfo.announceForAccessibility(");
  });

  it("handleNext rola até o cabeçalho Pontos e anuncia a nova faixa para VoiceOver", () => {
    const match = networkSheet.match(/const handleNext = useCallback\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain("scrollToIndex({ index: stopsAnchorIndex(listItems), animated: false })");
    expect(body).toContain("AccessibilityInfo.announceForAccessibility(");
  });
});
