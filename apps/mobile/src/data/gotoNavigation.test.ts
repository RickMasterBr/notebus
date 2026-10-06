import { describe, expect, it, vi } from "vitest";
import { openGotoOrNewOption, type NavigationPlaces } from "./gotoNavigation";
import type { SheetAction } from "../sheets/stack";

describe("openGotoOrNewOption", () => {
  it("abre TL-04 (folha goto) quando o destino já tem trajetos cadastrados", async () => {
    const dispatch = vi.fn<(action: SheetAction) => void>();
    const ensureRoute = vi.fn();
    const places: NavigationPlaces = {
      places: [
        { id: "p-casa", name: "Casa", deletedAt: null },
        { id: "p-facul", name: "Facul", deletedAt: null },
      ],
      routes: [
        { id: "r-1", destinationPlaceId: "p-facul", deletedAt: null },
      ],
      ensureRoute,
    };

    await openGotoOrNewOption(dispatch, places, "p-facul");

    expect(dispatch).toHaveBeenCalledWith({
      type: "push",
      sheet: { kind: "goto", destinationPlaceId: "p-facul" },
    });
    expect(ensureRoute).not.toHaveBeenCalled();
  });

  it("abre editor de opção pré-preenchido com Casa quando destino não tem trajetos", async () => {
    const dispatch = vi.fn<(action: SheetAction) => void>();
    const ensureRoute = vi.fn().mockResolvedValue({ id: "r-new" });
    const places: NavigationPlaces = {
      places: [
        { id: "p-casa", name: "Casa", deletedAt: null },
        { id: "p-trabalho", name: "Trabalho", deletedAt: null },
        { id: "p-academia", name: "Academia", deletedAt: null },
      ],
      routes: [],
      ensureRoute,
    };

    await openGotoOrNewOption(dispatch, places, "p-academia");

    expect(ensureRoute).toHaveBeenCalledWith("p-casa", "p-academia");
    expect(dispatch).toHaveBeenCalledWith({
      type: "push",
      sheet: { kind: "option", routeId: "r-new" },
    });
  });

  it("usa o primeiro outro lugar se Casa não existir ao abrir editor de opção", async () => {
    const dispatch = vi.fn<(action: SheetAction) => void>();
    const ensureRoute = vi.fn().mockResolvedValue({ id: "r-new-2" });
    const places: NavigationPlaces = {
      places: [
        { id: "p-trabalho", name: "Trabalho", deletedAt: null },
        { id: "p-academia", name: "Academia", deletedAt: null },
      ],
      routes: [],
      ensureRoute,
    };

    await openGotoOrNewOption(dispatch, places, "p-academia");

    expect(ensureRoute).toHaveBeenCalledWith("p-trabalho", "p-academia");
    expect(dispatch).toHaveBeenCalledWith({
      type: "push",
      sheet: { kind: "option", routeId: "r-new-2" },
    });
  });

  it("abre goto se não houver nenhum outro lugar cadastrado", async () => {
    const dispatch = vi.fn<(action: SheetAction) => void>();
    const ensureRoute = vi.fn();
    const places: NavigationPlaces = {
      places: [
        { id: "p-academia", name: "Academia", deletedAt: null },
      ],
      routes: [],
      ensureRoute,
    };

    await openGotoOrNewOption(dispatch, places, "p-academia");

    expect(ensureRoute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "push",
      sheet: { kind: "goto", destinationPlaceId: "p-academia" },
    });
  });
});
