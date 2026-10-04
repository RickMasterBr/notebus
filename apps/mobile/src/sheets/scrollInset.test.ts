import { describe, expect, it } from "vitest";
import {
  containerHeightOf,
  detentMetrics,
  hiddenBelow,
  highestPosition,
  maxScrollOffset,
  snapHeight,
} from "./scrollInset";

// iPhone de tela comum: janela 844 pt, área segura de cima 47 pt. Handle com linha do ✕: 44 pt. Pequeno medido: ~220 pt.
const WINDOW = 844;
const TOP = 47;
const HANDLE = 44;
const SNAPS = [220, "50%", "90%"];
const C = containerHeightOf(WINDOW, TOP);

describe("alturas da folha (medida do bloco 5b)", () => {
  it("o contêiner é a janela menos o topo seguro", () => {
    expect(C).toBe(797);
  });

  it("snap point: porcentagem do contêiner, px como vem, nunca acima do contêiner", () => {
    expect(snapHeight("50%", C)).toBeCloseTo(398.5, 5);
    expect(snapHeight(220, C)).toBe(220);
    expect(snapHeight(5000, C)).toBe(C);
  });

  it("a área de rolagem é a mesma nos 3 detents; a parte visível e a escondida mudam", () => {
    const m = detentMetrics(SNAPS, C, HANDLE);
    const area = 0.9 * C - HANDLE;
    for (const d of m) expect(d.scrollAreaHeight).toBeCloseTo(area, 5);
    expect(m[0]?.visibleHeight).toBeCloseTo(176, 5);
    expect(m[1]?.visibleHeight).toBeCloseTo(354.5, 5);
    expect(m[2]?.visibleHeight).toBeCloseTo(area, 5);
    // Diferença = o que a correção soma: pequeno 497,3 · médio 318,8 · grande 0.
    expect(m[0]?.hidden).toBeCloseTo(497.3, 1);
    expect(m[1]?.hidden).toBeCloseTo(318.8, 1);
    expect(m[2]?.hidden).toBeCloseTo(0, 5);
  });

  it("folha de uma altura só (TL-05, 90%): nada escondido", () => {
    const [only] = detentMetrics(["90%"], C, HANDLE);
    expect(only?.hidden).toBe(0);
  });
});

describe("a causa e a correção, por cenário (médio)", () => {
  const mid = detentMetrics(SNAPS, C, HANDLE)[1]!;

  it("lista longa sem correção: rola até o fim da área, e o fim do conteúdo fica abaixo da borda da tela", () => {
    const natural = 1500;
    const offset = maxScrollOffset(natural, mid, 0);
    expect(natural - offset).toBeCloseTo(mid.scrollAreaHeight, 5); // fim do conteúdo a 673 pt do topo da área
    expect(natural - offset).toBeGreaterThan(mid.visibleHeight); // mas só se veem 354 pt: cortado
  });

  it("lista longa com correção: o fim do conteúdo para exatamente na borda da tela", () => {
    const natural = 1500;
    const offset = maxScrollOffset(natural, mid, mid.hidden);
    expect(natural - offset).toBeCloseTo(mid.visibleHeight, 5);
  });

  it("lista média (cabe na área, não na parte visível): sem correção rola pouco; com correção rola até o fim", () => {
    const natural = 500; // 354 visíveis, 673 de área
    expect(maxScrollOffset(natural, mid, 0)).toBe(0);
    expect(maxScrollOffset(natural, mid, mid.hidden)).toBeCloseTo(natural - mid.visibleHeight, 5);
  });

  it("lista curta que cabe na parte visível: não rola, com ou sem correção", () => {
    const natural = 300;
    expect(maxScrollOffset(natural, mid, 0)).toBe(0);
    expect(maxScrollOffset(natural, mid, mid.hidden)).toBe(0);
  });

  it("no detent mais alto a correção é nula e nada muda", () => {
    const top = detentMetrics(SNAPS, C, HANDLE)[2]!;
    expect(maxScrollOffset(1500, top, top.hidden)).toBe(maxScrollOffset(1500, top, 0));
    expect(1500 - maxScrollOffset(1500, top, top.hidden)).toBeCloseTo(top.visibleHeight, 5);
  });
});

describe("espaço que acompanha o topo da folha", () => {
  const highest = highestPosition(SNAPS, C);

  it("posição do topo no detent mais alto: 0,1 do contêiner", () => {
    expect(highest).toBeCloseTo(79.7, 5);
  });

  it("nos encaixes dá o mesmo valor das medidas; entre eles é contínuo; acima do mais alto é 0", () => {
    const m = detentMetrics(SNAPS, C, HANDLE);
    expect(hiddenBelow(C - 220, highest)).toBeCloseTo(m[0]?.hidden ?? -1, 5);
    expect(hiddenBelow(C - 0.5 * C, highest)).toBeCloseTo(m[1]?.hidden ?? -1, 5);
    expect(hiddenBelow(highest, highest)).toBe(0);
    expect(hiddenBelow(highest - 30, highest)).toBe(0); // arrastar além do topo
    expect(hiddenBelow(highest + 100, highest)).toBe(100);
  });
});

describe("altura fixa da lista (solução final da E-02)", () => {
  it("a área da lista é a mesma em todos os detents e o respiro fecha a conta", () => {
    const container = containerHeightOf(WINDOW, TOP);
    const metrics = detentMetrics([220, "50%", "90%"], container, 44);
    const areas = new Set(metrics.map((m) => m.scrollAreaHeight));
    expect(areas.size).toBe(1);
    for (const m of metrics) {
      expect(m.visibleHeight + m.hidden).toBe(m.scrollAreaHeight);
    }
    expect(metrics[2]?.hidden).toBe(0);
  });
});

