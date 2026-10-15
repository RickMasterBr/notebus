// Dados inventados (D-091).
import { describe, expect, it } from "vitest";
import type { AheadStopRow } from "./ahead";
import { shownTimeline, toggleGap } from "./aheadExpand";

const row = (position: number, over: Partial<AheadStopRow> = {}): AheadStopRow => ({
  position,
  name: `P${position}`,
  time: "08:00",
  rangeStart: "07:58",
  rangeEnd: "08:02",
  kind: "interpolated",
  confidence: "estimated",
  isTimepoint: false,
  number: null,
  returnsHere: false,
  isLast: false,
  ...over,
});

const here = row(1);
// 2 3(controle) | 4 5 6 7 8 (lacuna de 5) | 9(controle) | 10 11 12 (lacuna de 3) | 13 (fim)
const stops = [
  row(2),
  row(3, { isTimepoint: true }),
  row(4),
  row(5),
  row(6),
  row(7),
  row(8),
  row(9, { isTimepoint: true }),
  row(10),
  row(11),
  row(12),
  row(13, { isLast: true }),
];

const label = (items: ReturnType<typeof shownTimeline>) =>
  items.map((i) => (i.kind === "gap" ? `${i.open ? "-" : "+"}${i.count}` : i.row.position));
const none = new Set<number>();

describe("shownTimeline: lacuna fechada mostra o resumo, aberta mostra as escondidas no lugar", () => {
  it("fechada: o resumo '+ N' no lugar das paragens escondidas", () => {
    expect(label(shownTimeline(here, stops, none))).toEqual([1, 2, 3, "+5", 9, "+3", 13]);
  });

  it("aberta: o resumo seguido de todas as escondidas, na ordem", () => {
    expect(label(shownTimeline(here, stops, new Set([4])))).toEqual([1, 2, 3, "-5", 4, 5, 6, 7, 8, 9, "+3", 13]);
  });

  it("todas abertas: todas as paragens da viagem, na ordem original", () => {
    const all = shownTimeline(here, stops, new Set([4, 10]));
    const positions = all.flatMap((i) => (i.kind === "stop" ? [i.row.position] : []));
    expect(positions).toEqual([1, ...stops.map((s) => s.position)]);
  });

  it("cada lacuna abre sozinha: abrir uma não abre a outra", () => {
    expect(label(shownTimeline(here, stops, new Set([10])))).toEqual([1, 2, 3, "+5", 9, "-3", 10, 11, 12, 13]);
  });

  it("a lacuna leva a posição da primeira escondida como id", () => {
    const gaps = shownTimeline(here, stops, none).filter((i) => i.kind === "gap");
    expect(gaps.map((g) => g.kind === "gap" && g.id)).toEqual([4, 10]);
  });

  it("lista vazia: só 'você'", () => {
    expect(label(shownTimeline(here, [], none))).toEqual([1]);
    expect(label(shownTimeline(here, [], new Set([4])))).toEqual([1]);
  });

  it("uma só escondida não vira lacuna (a regra de quais ficam escondidas não mudou); abrir não muda nada", () => {
    const one = [row(2, { isTimepoint: true }), row(3), row(4, { isLast: true })];
    expect(label(shownTimeline(here, one, none))).toEqual([1, 2, 3, 4]);
    expect(label(shownTimeline(here, one, new Set([3])))).toEqual([1, 2, 3, 4]);
  });

  it("id desconhecido no conjunto é ignorado", () => {
    expect(label(shownTimeline(here, stops, new Set([99])))).toEqual([1, 2, 3, "+5", 9, "+3", 13]);
  });
});

describe("toggleGap", () => {
  it("abre a fechada, fecha a aberta e não altera o conjunto recebido", () => {
    const start = new Set<number>();
    const opened = toggleGap(start, 4);
    expect([...opened]).toEqual([4]);
    expect(start.size).toBe(0);
    expect([...toggleGap(opened, 4)]).toEqual([]);
  });
});
