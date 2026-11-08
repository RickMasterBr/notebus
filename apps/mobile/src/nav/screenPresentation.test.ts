import { describe, expect, it } from "vitest";
import type { SheetKind } from "../sheets/stack";
import { presentationOf } from "./screenPresentation";

/** Todos os tipos de folha, para o teste ficar completo quando nascer um tipo novo (o TS obriga a atualizar). */
const TODOS: Record<SheetKind, "modal" | "card"> = {
  home: "card",
  search: "card",
  stop: "card",
  ahead: "card",
  why: "card",
  board: "card",
  alight: "card",
  trip: "modal",
  settings: "card",
  clockPicker: "card",
  backupImport: "card",
  record: "card",
  verify: "card",
  records: "card",
  places: "card",
  place: "card",
  route: "card",
  option: "card",
  alightPicker: "card",
  goto: "card",
  repeat: "card",
  alarms: "card",
  alarmIntro: "modal",
  override: "card",
  pastOverrides: "card",
  holiday: "card",
  networkInfo: "card",
  network: "card",
  lineDetail: "card",
  declare: "card",
  stopEdit: "card",
  recordTrip: "card",
  pendingAll: "card",
  lineNew: "card",
};

describe("presentationOf: modal ou cartão (D-392)", () => {
  it("trip e alarmIntro são modal", () => {
    expect(presentationOf("trip")).toBe("modal");
    expect(presentationOf("alarmIntro")).toBe("modal");
  });

  it("três outros tipos são card", () => {
    expect(presentationOf("home")).toBe("card");
    expect(presentationOf("search")).toBe("card");
    expect(presentationOf("records")).toBe("card");
  });

  it("só trip e alarmIntro são modal entre os 34 tipos de SheetKind", () => {
    for (const [kind, expected] of Object.entries(TODOS)) {
      expect(presentationOf(kind as SheetKind), kind).toBe(expected);
    }
    expect(Object.keys(TODOS).filter((kind) => presentationOf(kind as SheetKind) === "modal")).toEqual([
      "trip",
      "alarmIntro",
    ]);
  });
});
