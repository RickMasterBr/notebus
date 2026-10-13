/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { dragTargetIndex, moveStopTo, stopActionTarget } from "./lineStopReorder";
import { initialLineFormState, lineFormView, type LineFormStop } from "./lineForm";

describe("lineStopReorder: moveStopTo", () => {
  const stops: LineFormStop[] = [
    { id: "s1", name: "Paragem 1" },
    { id: "s2", name: "Paragem 2" },
    { id: "s3", name: "Paragem 3" },
    { id: "s4", name: "Paragem 4" },
  ];

  it("move elemento para frente", () => {
    const res = moveStopTo(stops, 1, 3);
    expect(res.map((s) => s.id)).toEqual(["s1", "s3", "s4", "s2"]);
  });

  it("move elemento para trás", () => {
    const res = moveStopTo(stops, 2, 0);
    expect(res.map((s) => s.id)).toEqual(["s3", "s1", "s2", "s4"]);
  });

  it("from === to devolve cópia igual com referência diferente", () => {
    const res = moveStopTo(stops, 1, 1);
    expect(res).toEqual(stops);
    expect(res).not.toBe(stops);
  });

  it("from fora dos limites devolve cópia igual com referência diferente", () => {
    const resUnder = moveStopTo(stops, -1, 2);
    expect(resUnder).toEqual(stops);
    expect(resUnder).not.toBe(stops);

    const resOver = moveStopTo(stops, 4, 2);
    expect(resOver).toEqual(stops);
    expect(resOver).not.toBe(stops);
  });

  it("to fora dos limites devolve cópia igual com referência diferente", () => {
    const resUnder = moveStopTo(stops, 1, -1);
    expect(resUnder).toEqual(stops);
    expect(resUnder).not.toBe(stops);

    const resOver = moveStopTo(stops, 1, 4);
    expect(resOver).toEqual(stops);
    expect(resOver).not.toBe(stops);
  });
});

describe("lineStopReorder: dragTargetIndex", () => {
  it.each([
    [{ index: 1, translationY: 70, rowHeight: 56, total: 4 }, 2],
    [{ index: 1, translationY: 30, rowHeight: 56, total: 4 }, 2],
    [{ index: 1, translationY: 27, rowHeight: 56, total: 4 }, 1],
    [{ index: 1, translationY: -120, rowHeight: 56, total: 4 }, 0],
    [{ index: 2, translationY: 500, rowHeight: 56, total: 4 }, 3],
    [{ index: 0, translationY: 40, rowHeight: 10, total: 4 }, 1],
    [{ index: 2, translationY: -40, rowHeight: 10, total: 4 }, 1],
    [{ index: 3, translationY: -84, rowHeight: 56, total: 4 }, 2],
  ])("%j resulta em %i", (input, expected) => {
    expect(dragTargetIndex(input)).toBe(expected);
  });
});

describe("lineStopReorder: stopActionTarget", () => {
  it("moveUp devolve index - 1", () => {
    expect(stopActionTarget("moveUp", 2)).toBe(1);
    expect(stopActionTarget("moveUp", 0)).toBe(-1);
  });

  it("moveDown devolve index + 1", () => {
    expect(stopActionTarget("moveDown", 2)).toBe(3);
    expect(stopActionTarget("moveDown", 3)).toBe(4);
  });

  it("ação desconhecida devolve null", () => {
    expect(stopActionTarget("remove", 2)).toBeNull();
    expect(stopActionTarget("other", 2)).toBeNull();
  });
});

describe("lineFormView: stopRows.actions", () => {
  it("1 paragem: nenhuma ação", () => {
    const state = {
      ...initialLineFormState(),
      stops: [{ id: "s1", name: "Paragem 1" }],
    };
    const view = lineFormView(state);
    expect(view.stopRows[0]?.actions).toEqual([]);
  });

  it("3 paragens: primeira só moveDown, meio as duas, última só moveUp", () => {
    const state = {
      ...initialLineFormState(),
      stops: [
        { id: "s1", name: "Paragem 1" },
        { id: "s2", name: "Paragem 2" },
        { id: "s3", name: "Paragem 3" },
      ],
    };
    const view = lineFormView(state);
    expect(view.stopRows[0]?.actions).toEqual([
      { name: "moveDown", labelKey: "line_create.stop.move_down" },
    ]);
    expect(view.stopRows[1]?.actions).toEqual([
      { name: "moveUp", labelKey: "line_create.stop.move_up" },
      { name: "moveDown", labelKey: "line_create.stop.move_down" },
    ]);
    expect(view.stopRows[2]?.actions).toEqual([
      { name: "moveUp", labelKey: "line_create.stop.move_up" },
    ]);
  });
});
