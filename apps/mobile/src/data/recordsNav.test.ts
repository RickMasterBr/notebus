import { describe, expect, it } from "vitest";
import {
  recordsHandle,
  recordsNavReduce,
  showHeaderClose,
  type RecordsPage,
} from "./recordsNav";

describe("recordsNav", () => {
  it("o reducer abre e volta sempre para a lista", () => {
    const root: RecordsPage = { kind: "list" };
    const opened = recordsNavReduce(root, { type: "open", boardingId: "board-1" });
    expect(opened).toEqual({ kind: "trip", boardingId: "board-1" });

    const backFromTrip = recordsNavReduce(opened, { type: "back" });
    expect(backFromTrip).toEqual({ kind: "list" });

    const backFromList = recordsNavReduce(root, { type: "back" });
    expect(backFromList).toEqual({ kind: "list" });
  });

  it("recordsHandle devolve showClose: false e press certo nos dois estados", () => {
    const listHandle = recordsHandle({ kind: "list" });
    expect(listHandle.showClose).toBe(false);
    expect(listHandle.press).toBe("close");

    const tripHandle = recordsHandle({ kind: "trip", boardingId: "b-1" });
    expect(tripHandle.showClose).toBe(false);
    expect(tripHandle.press).toBe("back");
  });

  it("showHeaderClose é verdadeiro só na lista", () => {
    expect(showHeaderClose({ kind: "list" })).toBe(true);
    expect(showHeaderClose({ kind: "trip", boardingId: "b-1" })).toBe(false);
  });
});
