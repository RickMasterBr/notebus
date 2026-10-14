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

// Bloco 6 · Item 0: lacunas que a revisão do bloco 5 achou por mutação (A a P).
// Cada asserção confere dentro de um recorte e tem mensagem própria.
describe("E-08.5 bloco 6 guardas de ligação (NetworkSheet.tsx, lacunas A a P)", () => {
  const between = (start: string, end: string) => {
    const s = networkSheet.indexOf(start);
    expect(s, `recorte: início não achado: ${start}`).toBeGreaterThan(-1);
    const e = networkSheet.indexOf(end, s + start.length);
    expect(e, `recorte: fim não achado: ${end}`).toBeGreaterThan(-1);
    return networkSheet.substring(s, e);
  };

  const pressableOf = (label: string) => {
    const idx = networkSheet.indexOf(`accessibilityLabel={t("${label}")}`);
    expect(idx, `Pressable com rótulo ${label} não achado`).toBeGreaterThan(-1);
    return networkSheet.substring(networkSheet.lastIndexOf("<Pressable", idx), networkSheet.indexOf("</Pressable>", idx));
  };

  const handlerOf = (name: string) => {
    const m = networkSheet.match(new RegExp(`const ${name} = useCallback\\(\\(\\) => \\{([\\s\\S]*?)\\}, \\[([^\\]]*)\\]\\);`));
    expect(m, `${name} não achado`).not.toBeNull();
    return { body: m![1] ?? "", deps: (m![2] ?? "").split(",").map((d) => d.trim()) };
  };

  const inputEl = between("<BottomSheetTextInput", " />");
  const listEl = between("<BottomSheetFlatList", " />");

  it("(A) renderItem passa handlePrev/handleNext ao StopsPager na ordem certa", () => {
    expect(
      networkSheet,
      "A: uso de StopsPager com handlePrev e handleNext trocados ou fora de ordem",
    ).toContain("<StopsPager stopsView={stopsView} handlePrev={handlePrev} handleNext={handleNext} />");
  });

  it("(A) dentro do StopsPager, Anterior liga onPress={handlePrev} e Próxima liga onPress={handleNext}", () => {
    expect(pressableOf("net.stops.page_prev.a11y"), "A: botão Anterior sem onPress={handlePrev}").toContain(
      "onPress={handlePrev}",
    );
    expect(pressableOf("net.stops.page_next.a11y"), "A: botão Próxima sem onPress={handleNext}").toContain(
      "onPress={handleNext}",
    );
  });

  it("(C) pager do fim só aparece com showPager e vem depois da iteração; o do topo vem antes", () => {
    expect(
      networkSheet,
      'C: pager do fim sem a condição "if (stopsView.showPager)"',
    ).toContain('if (stopsView.showPager) { items.push({ type: "stopPager", id: "stop-pager-bottom" }); }');
    expect(
      networkSheet,
      'C: pager do topo sem a condição "if (stopsView.showPager)"',
    ).toContain('if (stopsView.showPager) { items.push({ type: "stopPager", id: "stop-pager-top" }); }');
    const top = networkSheet.indexOf('id: "stop-pager-top"');
    const loop = networkSheet.indexOf("for (const stop of stopsView.items)");
    const bottom = networkSheet.indexOf('id: "stop-pager-bottom"');
    expect(top, "C: pager do topo deve vir antes do for dos pontos").toBeLessThan(loop);
    expect(bottom, "C: pager do fim deve vir depois do for dos pontos").toBeGreaterThan(loop);
  });

  it("(D) campo de busca só entra quando há pontos", () => {
    expect(
      networkSheet,
      "D: stop-search sem a condição stops.length > 0",
    ).toContain('if (stops.length > 0) { items.push({ type: "stopSearch", id: "stop-search" }); }');
  });

  it("(E) mensagem de sem resultado depende de stopsView.showNoMatch", () => {
    expect(
      networkSheet,
      "E: ramo empty-stops-search sem a condição stopsView.showNoMatch",
    ).toContain(
      '} else if (stopsView.showNoMatch) { items.push({ type: "empty", id: "empty-stops-search", message: t("net.stops.no_match"), }); }',
    );
  });

  it("(F) cada botão do pager tem o accessibilityState do seu lado", () => {
    expect(
      pressableOf("net.stops.page_prev.a11y"),
      "F: botão Anterior sem accessibilityState disabled",
    ).toContain("accessibilityState={{ disabled: !stopsView.hasPrev }}");
    expect(
      pressableOf("net.stops.page_next.a11y"),
      "F: botão Próxima sem accessibilityState disabled",
    ).toContain("accessibilityState={{ disabled: !stopsView.hasNext }}");
  });

  it("(G) o × da busca limpa pelo handleTermChange (termo e página juntos)", () => {
    const clear = between('{term !== "" ? (', ") : null}");
    expect(clear, "G: × sem o rótulo search.clear.a11y").toContain('accessibilityLabel={t("search.clear.a11y")}');
    expect(clear, 'G: × sem onPress={() => handleTermChange("")}').toContain('onPress={() => handleTermChange("")}');
  });

  it("(H) listItems depende de lines, stops e stopsView", () => {
    expect(
      networkSheet,
      "H: dependências de listItems sem stopsView",
    ).toContain("return items; }, [lines, stops, stopsView]);");
  });

  it("(I) renderItem depende de term, stopsView e dos três handlers da busca", () => {
    const tail = networkSheet.substring(networkSheet.indexOf("const renderItem = useCallback("));
    const m = tail.match(/return null; \}, \[([^\]]*)\]/);
    expect(m, "I: fecho do useCallback do renderItem não achado").not.toBeNull();
    const deps = m![1]!.split(",").map((d) => d.trim());
    for (const name of ["term", "stopsView", "handleTermChange", "handlePrev", "handleNext"]) {
      expect(deps, `I: renderItem sem ${name} nas dependências`).toContain(name);
    }
  });

  it("(J) lista sobe com a altura do teclado", () => {
    expect(networkSheet, "J: useKeyboardHeight não chamado").toContain("const keyboardHeight = useKeyboardHeight();");
    expect(
      networkSheet,
      "J: paddingBottom sem + keyboardHeight",
    ).toContain("paddingBottom: insets.bottom + space.lg + keyboardHeight");
  });

  it("(K) lista tem ref e trata falha de rolagem", () => {
    expect(listEl, "K: lista sem ref={listRef}").toContain("ref={listRef}");
    expect(
      listEl,
      "K: lista sem o onScrollToIndexFailed que rola por offset",
    ).toContain(
      "onScrollToIndexFailed={(info) => { listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false, }); }}",
    );
  });

  it("(L) handlePrev e handleNext anunciam a faixa da página nova, não a antiga", () => {
    const range = 't("net.stops.range", { from: nextView.from, to: nextView.to, total: nextView.total })';
    const nextView = "const nextView = stopsPageView({ stops, term, page: newPage });";
    const prev = handlerOf("handlePrev").body;
    const next = handlerOf("handleNext").body;
    expect(prev, "L: handlePrev não calcula nextView da página nova").toContain(nextView);
    expect(prev, "L: handlePrev não anuncia a faixa de nextView").toContain(range);
    expect(next, "L: handleNext não calcula nextView da página nova").toContain(nextView);
    expect(next, "L: handleNext não anuncia a faixa de nextView").toContain(range);
  });

  it("(N) campo de busca tem placeholder e rótulo de acessibilidade", () => {
    expect(inputEl, "N: campo sem placeholder").toContain('placeholder={t("net.stops.search_placeholder")}');
    expect(inputEl, "N: campo sem accessibilityLabel").toContain(
      'accessibilityLabel={t("net.stops.search_placeholder")}',
    );
  });

  it("(O) atributos do campo de busca: sem autocorreção, sem maiúscula, tecla de busca, sem autoFocus", () => {
    expect(inputEl, "O: campo sem autoCorrect={false}").toContain("autoCorrect={false}");
    expect(inputEl, 'O: campo sem autoCapitalize="none"').toContain('autoCapitalize="none"');
    expect(inputEl, 'O: campo sem returnKeyType="search"').toContain('returnKeyType="search"');
    expect(inputEl, "O: campo com autoFocus").not.toContain("autoFocus");
  });

  it("(P) handlePrev e handleNext dependem de stopsView.page, stops, term e listItems", () => {
    for (const name of ["handlePrev", "handleNext"]) {
      const { deps } = handlerOf(name);
      for (const dep of ["stopsView.page", "stops", "term", "listItems"]) {
        expect(deps, `P: ${name} sem ${dep} nas dependências`).toContain(dep);
      }
    }
  });
});

describe("E-08.5 bloco 8 Item 0.3: lacunas Q3 e Q4", () => {
  const handlerOf = (name: string) => {
    const m = networkSheet.match(
      new RegExp(`const ${name} = useCallback\\(\\(\\) => \\{([\\s\\S]*?)\\}, \\[([^\\]]*)\\]\\);`),
    );
    expect(m, `${name} não achado`).not.toBeNull();
    return { body: (m![1] ?? "").trim(), deps: (m![2] ?? "").split(",").map((d) => d.trim()) };
  };

  it("(Q3) o corpo de handlePrev e o de handleNext começam por activeSwipeable.current?.close(); antes de setPage(", () => {
    for (const name of ["handlePrev", "handleNext"]) {
      const { body } = handlerOf(name);
      expect(
        body.startsWith("activeSwipeable.current?.close();"),
        `Q3: ${name} não começa por activeSwipeable.current?.close();`,
      ).toBe(true);
      const closeIdx = body.indexOf("activeSwipeable.current?.close();");
      const setPageIdx = body.indexOf("setPage(");
      expect(setPageIdx, `Q3: ${name} não chama setPage(`).toBeGreaterThan(-1);
      expect(closeIdx, `Q3: em ${name}, activeSwipeable.current?.close() deve vir antes de setPage(`).toBeLessThan(setPageIdx);
    }
  });

  it("(Q4) dentro de StopsPager, o Text com styles.pagerRange contém contíguo {t('net.stops.range', { from: stopsView.from, to: stopsView.to, total: stopsView.total, })}", () => {
    const pagerStart = networkSheet.indexOf("function StopsPager(");
    expect(pagerStart, "Q4: StopsPager não achado").toBeGreaterThan(-1);
    const pagerChunk = networkSheet.substring(pagerStart);
    const rangeIdx = pagerChunk.indexOf("styles.pagerRange");
    expect(rangeIdx, "Q4: styles.pagerRange não achado no StopsPager").toBeGreaterThan(-1);
    const textStart = pagerChunk.lastIndexOf("<Text", rangeIdx);
    const textEnd = pagerChunk.indexOf("</Text>", rangeIdx);
    const textChunk = pagerChunk.substring(textStart, textEnd);
    expect(
      textChunk,
      'Q4: Text do pagerRange sem {t("net.stops.range", { from: stopsView.from, to: stopsView.to, total: stopsView.total, })}',
    ).toContain(
      '{t("net.stops.range", { from: stopsView.from, to: stopsView.to, total: stopsView.total, })}',
    );
  });
});

