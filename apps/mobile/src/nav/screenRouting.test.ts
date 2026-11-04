import { describe, expect, it } from "vitest";
import type { SheetContent, SheetKind } from "../sheets/stack";
import { DESTINO, routeOf } from "./screenRouting";

const TELAS: SheetKind[] = [
  "records", "record", "verify", "settings", "override", "pastOverrides", "holiday", "networkInfo", "backupImport",
  "clockPicker", "alarms", "repeat", "alarmIntro", "network", "stopEdit", "places", "place", "route", "option", "alightPicker",
];
const FOLHAS: SheetKind[] = ["search", "stop", "lineDetail", "ahead", "why", "board", "goto", "declare", "trip", "alight", "home"];

describe("screenRouting: os 31 tipos de SheetKind", () => {
  it("a tabela cobre exatamente 31 tipos (20 telas, 11 folhas com a base)", () => {
    expect(Object.keys(DESTINO)).toHaveLength(31);
    expect(TELAS).toHaveLength(20);
    expect(FOLHAS).toHaveLength(11);
  });
  it.each(TELAS)("%s é tela", (kind) => expect(DESTINO[kind]).toBe("tela"));
  it.each(FOLHAS)("%s é folha", (kind) => expect(DESTINO[kind]).toBe("folha"));
});

describe("routeOf", () => {
  const pick: SheetContent = { kind: "search", pick: true };
  it("Busca em modo escolha: tela com uma tela em foco, folha sem", () => {
    expect(routeOf(pick, { screenFocused: true })).toBe("tela");
    expect(routeOf(pick, { screenFocused: false })).toBe("folha");
  });
  it("Busca comum continua folha mesmo com tela em foco", () => {
    expect(routeOf({ kind: "search" }, { screenFocused: true })).toBe("folha");
  });
  it("tela continua tela sem foco", () => {
    expect(routeOf({ kind: "settings" }, { screenFocused: false })).toBe("tela");
  });
});
