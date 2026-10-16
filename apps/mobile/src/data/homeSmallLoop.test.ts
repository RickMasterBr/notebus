import { describe, expect, it } from "vitest";
import { containerHeightOf, snapHeight } from "../sheets/scrollInset";
import { homeFadeHeight, homeFadeProgress } from "./homeFade";
import { homeSmallDetent, homeSmallPlan, nextSnapSmall } from "./homeSmallDetent";

const SCALE = 3; // iPhone: 3 pixels por ponto
const WINDOW = 852;
const INSET_TOP = 59;
const INSET_BOTTOM = 34;
const HANDLE = 20;
const MARGIN = 16;
const FALLBACK = 120;

/** Altura que o Yoga reporta no `onLayout`: as bordas caem na grade de pixels, a altura é a diferença. */
function measured(y: number, h: number): number {
  return (Math.round((y + h) * SCALE) - Math.round(y * SCALE)) / SCALE;
}

interface Model {
  pill: number;
  phrase: number;
  card?: number;
  /** Aplica a zona morta de 0,5 pt à altura da pílula medida (conserto do item 3). */
  deadband?: boolean;
}

/** Um passo do laço: topo da folha → progresso → altura da frase → posição da pílula → medida → `small`. */
function step(sheetTop: number, small: number, prevPill: number, m: Model): { small: number; pill: number } {
  const container = containerHeightOf(WINDOW, INSET_TOP);
  const topAtMedium = WINDOW - snapHeight("50%", container);
  const p = homeFadeProgress(sheetTop, WINDOW - small, topAtMedium);
  const clip = homeFadeHeight(p, m.phrase);
  let pill = measured(HANDLE + (m.card ?? 0) + clip, m.pill);
  if (m.deadband && Math.abs(pill - prevPill) < 0.5) pill = prevPill;
  const next = homeSmallDetent({
    handleHeight: HANDLE,
    cardHeight: m.card ?? 0,
    pillHeight: pill,
    insetBottom: INSET_BOTTOM,
    margin: MARGIN,
    fallback: FALLBACK,
  });
  return { small: next, pill };
}

/** Dedo parado em `sheetTop`: itera até repetir um estado; devolve os valores de `small` do ciclo. */
function settle(sheetTop: number, m: Model): number[] {
  let small = HANDLE + (m.card ?? 0) + m.pill + INSET_BOTTOM + MARGIN;
  let pill = m.pill;
  const seen = new Map<string, number>();
  const trail: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const key = `${small}|${pill}`;
    if (seen.has(key)) return trail.slice(seen.get(key));
    seen.set(key, trail.length);
    trail.push(small);
    const r = step(sheetTop, small, pill, m);
    small = r.small;
    pill = r.pill;
  }
  return trail.slice(-2);
}

/** Varre o trecho do fade e conta posições do dedo cujo `small` não assenta; devolve também a maior amplitude. */
function sweep(m: Model): { unstable: number; amplitude: number; total: number } {
  const container = containerHeightOf(WINDOW, INSET_TOP);
  const topAtMedium = WINDOW - snapHeight("50%", container);
  const topAtSmall = WINDOW - (HANDLE + (m.card ?? 0) + m.pill + INSET_BOTTOM + MARGIN);
  let unstable = 0;
  let amplitude = 0;
  let total = 0;
  for (let top = topAtMedium; top <= topAtSmall; top += 0.05) {
    total += 1;
    const cycle = settle(top, m);
    const spread = Math.max(...cycle) - Math.min(...cycle);
    if (cycle.length > 1) {
      unstable += 1;
      amplitude = Math.max(amplitude, spread);
    }
  }
  return { unstable, amplitude, total };
}

describe("detent pequeno da Início (E-09 bloco 20b)", () => {
  it("a conta fixa os números do dispositivo (114 e 113)", () => {
    const base = { handleHeight: 20, cardHeight: 0, insetBottom: 34, margin: 16, fallback: 120 };
    expect(homeSmallDetent({ ...base, pillHeight: 44 })).toBe(114);
    expect(homeSmallDetent({ ...base, pillHeight: 43 })).toBe(113);
  });

  it("usa o valor de reserva até medir o handle e a pílula", () => {
    const base = { cardHeight: 0, insetBottom: 34, margin: 16, fallback: 120 };
    expect(homeSmallDetent({ ...base, handleHeight: 0, pillHeight: 44 })).toBe(120);
    expect(homeSmallDetent({ ...base, handleHeight: 20, pillHeight: 0 })).toBe(120);
  });

  it("homeSmallPlan devolve o plano com small consumido por campo", () => {
    const base = { handleHeight: 20, cardHeight: 0, insetBottom: 34, margin: 16, fallback: 120 };
    expect(homeSmallPlan({ ...base, pillHeight: 44 })).toEqual({ small: 114 });
    expect(homeSmallPlan({ ...base, pillHeight: 43 })).toEqual({ small: 113 });
    expect(homeSmallPlan({ ...base, handleHeight: 0, pillHeight: 44 })).toEqual({ small: 120 });
  });

  it("modelo: pílula com número inteiro de pixels não oscila", () => {
    expect(sweep({ pill: 44, phrase: 62.33 }).unstable).toBe(0);
  });

  it("modelo: pílula fracionária oscila 1 pixel (0,33 pt) com o dedo parado no trecho do fade", () => {
    const r = sweep({ pill: 44.5, phrase: 62.33 });
    expect(r.unstable).toBeGreaterThan(0);
    expect(r.amplitude).toBeCloseTo(1 / SCALE, 5);
  });

  it("modelo: a zona morta de 0,5 pt elimina a oscilação", () => {
    expect(sweep({ pill: 44.5, phrase: 62.33, deadband: true }).unstable).toBe(0);
  });

  it("modelo: frase desmontada ao fim da descida não muda o detent pequeno (item 4)", () => {
    // A frase só entra na altura da lista (`scrollAreaHeight`), nunca em `small`: com ou sem frase o resultado é o mesmo.
    expect(settle(500, { pill: 44, phrase: 62 })).toEqual(settle(500, { pill: 44, phrase: 0 }));
  });
});

describe("nextSnapSmall: o detent pequeno só troca com a gaveta parada", () => {
  const tops = [426, 85]; // médio e grande (valores de exemplo)
  it("arrastando no meio do fade, mantém o anterior", () => {
    expect(nextSnapSmall(114, 115, 600, WINDOW, tops)).toBe(114);
  });
  it("parada no pequeno, aceita o novo", () => {
    expect(nextSnapSmall(114, 115, WINDOW - 114, WINDOW, tops)).toBe(115);
  });
  it("parada no médio, aceita o novo", () => {
    expect(nextSnapSmall(114, 130, 426, WINDOW, tops)).toBe(130);
  });
  it("ainda fora da tela (primeira medida), aceita o novo", () => {
    expect(nextSnapSmall(120, 114, WINDOW + 200, WINDOW, tops)).toBe(114);
  });
  it("variação menor que 0,5 pt nunca troca", () => {
    expect(nextSnapSmall(114, 114.33, WINDOW - 114, WINDOW, tops)).toBe(114);
  });
});
