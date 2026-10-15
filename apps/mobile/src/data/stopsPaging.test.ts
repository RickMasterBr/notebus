import { describe, expect, it } from "vitest";
import { type SearchableStop, searchStops } from "@notebus/domain";
import {
  STOPS_PAGE_SIZE,
  isSearching,
  matchStops,
  sliceStopsPage,
  stopsAnchorIndex,
  stopsPageView,
} from "./stopsPaging";

function makeStops(count: number, prefix = "s"): SearchableStop[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i + 1).padStart(3, "0")}`,
    name: `Ponto ${i + 1}`,
    aliases: [],
    externalId: null,
  }));
}

describe("stopsPaging", () => {
  it("STOPS_PAGE_SIZE vale 50", () => {
    expect(STOPS_PAGE_SIZE).toBe(50);
  });

  it("0 pontos, sem termo: items vazio, pageCount 1, showPager falso, showNoMatch falso, from 0 e to 0", () => {
    const view = stopsPageView({ stops: [], term: "", page: 0 });
    expect(view.searching).toBe(false);
    expect(view.total).toBe(0);
    expect(view.pageCount).toBe(1);
    expect(view.page).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.from).toBe(0);
    expect(view.to).toBe(0);
    expect(view.hasPrev).toBe(false);
    expect(view.hasNext).toBe(false);
    expect(view.showPager).toBe(false);
    expect(view.showNoMatch).toBe(false);
  });

  it("50 pontos: 1 página, 50 itens, showPager falso, hasNext falso", () => {
    const stops = makeStops(50);
    const view = stopsPageView({ stops, term: "", page: 0 });
    expect(view.total).toBe(50);
    expect(view.pageCount).toBe(1);
    expect(view.page).toBe(0);
    expect(view.items).toHaveLength(50);
    expect(view.items[0]?.id).toBe("s001");
    expect(view.items[49]?.id).toBe("s050");
    expect(view.from).toBe(1);
    expect(view.to).toBe(50);
    expect(view.hasPrev).toBe(false);
    expect(view.hasNext).toBe(false);
    expect(view.showPager).toBe(false);
    expect(view.showNoMatch).toBe(false);
  });

  it("51 pontos, página 0: 50 itens, pageCount 2, from 1, to 50, hasPrev falso, hasNext verdadeiro", () => {
    const stops = makeStops(51);
    const view = stopsPageView({ stops, term: "", page: 0 });
    expect(view.total).toBe(51);
    expect(view.pageCount).toBe(2);
    expect(view.page).toBe(0);
    expect(view.items).toHaveLength(50);
    expect(view.from).toBe(1);
    expect(view.to).toBe(50);
    expect(view.hasPrev).toBe(false);
    expect(view.hasNext).toBe(true);
    expect(view.showPager).toBe(true);
    expect(view.showNoMatch).toBe(false);
  });

  it("51 pontos, página 1: 1 item (o 51º), from 51, to 51, hasPrev verdadeiro, hasNext falso", () => {
    const stops = makeStops(51);
    const view = stopsPageView({ stops, term: "", page: 1 });
    expect(view.total).toBe(51);
    expect(view.pageCount).toBe(2);
    expect(view.page).toBe(1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.id).toBe("s051");
    expect(view.from).toBe(51);
    expect(view.to).toBe(51);
    expect(view.hasPrev).toBe(true);
    expect(view.hasNext).toBe(false);
    expect(view.showPager).toBe(true);
  });

  it("100 e 101 pontos: pageCount 2 e 3", () => {
    const stops100 = makeStops(100);
    const view100 = stopsPageView({ stops: stops100, term: "", page: 0 });
    expect(view100.pageCount).toBe(2);

    const stops101 = makeStops(101);
    const view101 = stopsPageView({ stops: stops101, term: "", page: 0 });
    expect(view101.pageCount).toBe(3);
  });

  it("página fora do alcance (9 com 51 pontos; -3): limitada a 1 e a 0", () => {
    const stops = makeStops(51);
    const viewOver = stopsPageView({ stops, term: "", page: 9 });
    expect(viewOver.page).toBe(1);
    expect(viewOver.items).toHaveLength(1);
    expect(viewOver.from).toBe(51);
    expect(viewOver.to).toBe(51);

    const viewUnder = stopsPageView({ stops, term: "", page: -3 });
    expect(viewUnder.page).toBe(0);
    expect(viewUnder.items).toHaveLength(50);
    expect(viewUnder.from).toBe(1);
    expect(viewUnder.to).toBe(50);
  });

  it("a lista encolhe (era a página 2 de 3, agora 60 pontos): a página volta a 1", () => {
    const stops60 = makeStops(60);
    // Página solicitada era 2 (3ª página, antes de apagar itens)
    const view = stopsPageView({ stops: stops60, term: "", page: 2 });
    expect(view.pageCount).toBe(2);
    expect(view.page).toBe(1);
    expect(view.items).toHaveLength(10);
    expect(view.from).toBe(51);
    expect(view.to).toBe(60);
    expect(view.hasPrev).toBe(true);
    expect(view.hasNext).toBe(false);
  });

  it("termo '   ': igual a termo vazio (lista inteira)", () => {
    const stops = makeStops(60);
    const view = stopsPageView({ stops, term: "   ", page: 0 });
    expect(view.searching).toBe(false);
    expect(view.total).toBe(60);
    expect(view.items).toHaveLength(50);
    expect(view.items[0]?.id).toBe("s001");
  });

  it("termo 'ESTAÇÃO' acha 'Estacao Central' e o apelido 'Rodoviária' acha pelo apelido; o ID externo acha pelo ID: os três casam", () => {
    const stops: SearchableStop[] = [
      { id: "s001", name: "Estacao Central", aliases: [], externalId: null },
      { id: "s002", name: "Terminal Sul", aliases: ["Rodoviária"], externalId: null },
      { id: "s003", name: "Parque Verde", aliases: [], externalId: "EXT-3517" },
      { id: "s004", name: "Praça do Comércio", aliases: [], externalId: null },
    ];

    const matchName = stopsPageView({ stops, term: "ESTAÇÃO", page: 0 });
    expect(matchName.searching).toBe(true);
    expect(matchName.items.map((s) => s.id)).toEqual(["s001"]);

    const matchAlias = stopsPageView({ stops, term: "rodoviaria", page: 0 });
    expect(matchAlias.searching).toBe(true);
    expect(matchAlias.items.map((s) => s.id)).toEqual(["s002"]);

    const matchExtId = stopsPageView({ stops, term: "3517", page: 0 });
    expect(matchExtId.searching).toBe(true);
    expect(matchExtId.items.map((s) => s.id)).toEqual(["s003"]);
  });

  it("termo com 120 resultados: total 120, pageCount 3, a ordem de searchStops (quem começa com o termo vem antes)", () => {
    // 60 pontos onde o nome começa com "Centro..." e 60 onde o nome contém "... Centro"
    const prefixHits: SearchableStop[] = Array.from({ length: 60 }, (_, i) => ({
      id: `p${String(i + 1).padStart(3, "0")}`,
      name: `Centro Alpha ${i + 1}`,
      aliases: [],
      externalId: null,
    }));
    const containsHits: SearchableStop[] = Array.from({ length: 60 }, (_, i) => ({
      id: `c${String(i + 1).padStart(3, "0")}`,
      name: `Rua do Centro ${i + 1}`,
      aliases: [],
      externalId: null,
    }));
    // Intercalamos na entrada
    const stops: SearchableStop[] = [];
    for (let i = 0; i < 60; i++) {
      stops.push(containsHits[i]!, prefixHits[i]!);
    }

    const view = stopsPageView({ stops, term: "centro", page: 0 });
    expect(view.searching).toBe(true);
    expect(view.total).toBe(120);
    expect(view.pageCount).toBe(3);
    expect(view.page).toBe(0);
    expect(view.items).toHaveLength(50);
    expect(view.from).toBe(1);
    expect(view.to).toBe(50);
    expect(view.hasPrev).toBe(false);
    expect(view.hasNext).toBe(true);
    expect(view.showPager).toBe(true);
    // Todos os 50 primeiros itens da página 0 devem ser prefixHits (começam com "Centro")
    expect(view.items.every((item) => item.id.startsWith("p"))).toBe(true);
  });

  it("termo sem resultado: items vazio, showNoMatch verdadeiro, showPager falso, pageCount 1", () => {
    const stops = makeStops(10);
    const view = stopsPageView({ stops, term: "inexistente", page: 0 });
    expect(view.searching).toBe(true);
    expect(view.total).toBe(0);
    expect(view.pageCount).toBe(1);
    expect(view.page).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.from).toBe(0);
    expect(view.to).toBe(0);
    expect(view.hasPrev).toBe(false);
    expect(view.hasNext).toBe(false);
    expect(view.showPager).toBe(false);
    expect(view.showNoMatch).toBe(true);
  });

  it("dois pontos com o mesmo nome e ids diferentes: os dois aparecem, em ids diferentes", () => {
    const stops: SearchableStop[] = [
      { id: "s001", name: "Estação", aliases: [], externalId: null },
      { id: "s002", name: "Estação", aliases: [], externalId: null },
    ];
    const view = stopsPageView({ stops, term: "estacao", page: 0 });
    expect(view.total).toBe(2);
    expect(view.items).toHaveLength(2);
    expect(view.items.map((s) => s.id)).toEqual(["s001", "s002"]);
  });

  it("entrada: a ordem e o tamanho do array de entrada não mudam depois da chamada", () => {
    const original: SearchableStop[] = [
      { id: "s002", name: "Zeta", aliases: [], externalId: null },
      { id: "s001", name: "Alpha", aliases: [], externalId: null },
    ];
    const copy = [...original];
    stopsPageView({ stops: copy, term: "", page: 0 });
    expect(copy).toEqual(original);
    stopsPageView({ stops: copy, term: "a", page: 0 });
    expect(copy).toEqual(original);
  });

  it("stopsAnchorIndex acha 'header-stops' numa lista com os ids da tela; -1 sem ele", () => {
    const items = [
      { id: "header-lines" },
      { id: "new-line" },
      { id: "header-stops" },
      { id: "new-stop" },
    ];
    expect(stopsAnchorIndex(items)).toBe(2);
    expect(stopsAnchorIndex([{ id: "header-lines" }])).toBe(-1);
  });

  describe("equivalência entre stopsPageView e matchStops + sliceStopsPage", () => {
    it("saída idêntica página a página para sem termo, termo curto e termo raro", () => {
      const stops: SearchableStop[] = Array.from({ length: 125 }, (_, i) => ({
        id: `stop-${i + 1}`,
        name: i % 2 === 0 ? `Rua Principal ${i + 1}` : `Avenida Central ${i + 1}`,
        aliases: i % 5 === 0 ? [`Apelido ${i + 1}`] : [],
        externalId: i % 3 === 0 ? `EXT-${i + 1}` : null,
      }));

      const terms = ["", "rua", "zzz"];

      for (const term of terms) {
        const searching = isSearching(term);
        const matched = matchStops(stops, term);
        const legacyP0 = stopsPageView({ stops, term, page: 0 });
        const pageCount = legacyP0.pageCount;

        for (let page = 0; page < pageCount; page++) {
          const legacy = stopsPageView({ stops, term, page });
          const decoupled = sliceStopsPage({ matched, page, searching });
          expect(decoupled).toEqual(legacy);
        }
      }
    });
  });

  it("L15: isSearching('   ') é false e isSearching(' a ') é true", () => {
    expect(isSearching("   ")).toBe(false);
    expect(isSearching(" a ")).toBe(true);
  });

  describe("equivalência estrita entre matchStops otimizado e searchStops do domínio (FN-11)", () => {
    it("devolve exatamente os mesmos resultados e na mesma ordem que searchStops para lista de 1.500 pontos", () => {
      const stops: SearchableStop[] = Array.from({ length: 1500 }, (_, i) => ({
        id: `stop-${i + 1}`,
        name: i % 3 === 0 ? `Estação Central ${i + 1}` : i % 2 === 0 ? `Avenida São Bento ${i + 1}` : `Rua Santo André ${i + 1}`,
        aliases: i % 5 === 0 ? [`Terminal de Ônibus ${i + 1}`] : [],
        externalId: i % 4 === 0 ? `EXT-${i + 1}` : null,
      }));

      const terms = [
        "s",
        "santo",
        "central",
        "estação",
        "ESTAÇÃO",
        "são bento",
        "terminal",
        "35",
        "inexistente",
      ];

      for (const term of terms) {
        const expected = searchStops(stops, term);
        const actual = matchStops(stops, term);
        expect(actual).toEqual(expected);
      }
    });

    it("mantém cache por referência do array de pontos", () => {
      const stops: SearchableStop[] = [
        { id: "s1", name: "Ponto A", aliases: [], externalId: null },
        { id: "s2", name: "Ponto B", aliases: [], externalId: null },
      ];
      const res1 = matchStops(stops, "a");
      const res2 = matchStops(stops, "b");
      expect(res1.map((s) => s.id)).toEqual(["s1"]);
      expect(res2.map((s) => s.id)).toEqual(["s2"]);
    });
  });
});

