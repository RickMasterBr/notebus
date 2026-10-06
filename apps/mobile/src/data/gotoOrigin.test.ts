import { describe, expect, it } from "vitest";
import { resolveGotoOrigin } from "./gotoOrigin";
import type { OptionRow, PlaceRow, RouteRow } from "../db/places";

const T0 = 1_790_000_000_000;

function makePlace(id: string, name: string, overrides: Partial<PlaceRow> = {}): PlaceRow {
  return {
    id,
    name,
    icon: null,
    lat: null,
    lon: null,
    isShortcut: false,
    shortcutOrder: null,
    source: "user",
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
  };
}

function makeRoute(id: string, originPlaceId: string, destinationPlaceId: string, createdAt = T0): RouteRow {
  return {
    id,
    originPlaceId,
    destinationPlaceId,
    source: "user",
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

describe("Regra de resolução da origem no TL-04 (D-175)", () => {
  const casa = makePlace("p-casa", "Casa");
  const trabalho = makePlace("p-trabalho", "Trabalho");
  const shopping = makePlace("p-shopping", "Shopping");
  const facul = makePlace("p-facul", "Faculdade");

  it("1. Escolha salva tem precedência", () => {
    const routes: RouteRow[] = [
      makeRoute("r1", casa.id, shopping.id, T0),
      makeRoute("r2", trabalho.id, shopping.id, T0 + 10),
    ];
    // Mesmo existindo 'Casa', a escolha salva era 'Trabalho'
    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [casa, trabalho, shopping],
      routes,
      lastOriginMap: { [shopping.id]: trabalho.id },
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(trabalho.id);
      expect(res.originPlace.name).toBe("Trabalho");
    }
  });

  it("2. Sem escolha salva: lugar chamado 'Casa' (case-insensitive) vence", () => {
    const casaUpper = makePlace("p-casa-upper", "  CASA  ");
    const routes: RouteRow[] = [
      makeRoute("r1", trabalho.id, shopping.id, T0),
      makeRoute("r2", casaUpper.id, shopping.id, T0 + 10),
    ];

    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [trabalho, casaUpper, shopping],
      routes,
      lastOriginMap: {},
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(casaUpper.id);
      expect(res.originPlace.name).toBe("  CASA  ");
    }
  });

  it("3. Sem 'Casa': primeiro trajeto que chega ao destino", () => {
    const routes: RouteRow[] = [
      makeRoute("r-primeiro", trabalho.id, shopping.id, T0),
      makeRoute("r-segundo", facul.id, shopping.id, T0 + 500),
    ];

    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [trabalho, facul, shopping],
      routes,
      lastOriginMap: {},
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(trabalho.id);
      expect(res.originPlace.name).toBe("Trabalho");
    }
  });

  it("3b. Sem 'Casa': trajeto com opções tem preferência sobre trajeto vazio", () => {
    const rVazia = makeRoute("r-vazia", trabalho.id, shopping.id, T0);
    const rComOpcao = makeRoute("r-com-opcao", facul.id, shopping.id, T0 + 500);
    const opt: OptionRow = {
      id: "opt-1",
      routeId: rComOpcao.id,
      kind: "bus",
      boardPatternStopId: "ps-1",
      alightPatternStopId: "ps-2",
      walkMinutes: null,
      sort: 0,
      source: "user",
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
    };

    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [trabalho, facul, shopping],
      routes: [rVazia, rComOpcao],
      options: [opt],
      lastOriginMap: {},
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(facul.id);
      expect(res.originPlace.name).toBe("Faculdade");
    }
  });

  it("4. Sem nenhum trajeto para o destino: fallback para editor (no_route)", () => {
    // Rota existe para faculdade, mas nenhuma para shopping
    const routes: RouteRow[] = [
      makeRoute("r1", casa.id, facul.id, T0),
    ];

    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [casa, shopping, facul],
      routes,
      lastOriginMap: { [shopping.id]: casa.id },
    });

    expect(res.kind).toBe("no_route");
  });

  it("5. Escolha salva para lugar deletado cai para 'Casa'", () => {
    const trabalhoDeletado = makePlace("p-trabalho-del", "Trabalho", { deletedAt: T0 + 1000 });
    const routes: RouteRow[] = [
      makeRoute("r1", casa.id, shopping.id, T0),
      makeRoute("r2", trabalhoDeletado.id, shopping.id, T0 + 10),
    ];

    const res = resolveGotoOrigin({
      destinationPlaceId: shopping.id,
      places: [casa, trabalhoDeletado, shopping],
      routes,
      lastOriginMap: { [shopping.id]: trabalhoDeletado.id },
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(casa.id);
    }
  });

  it("6. Destino chamado 'Casa' não escolhe a si mesmo como origem", () => {
    const routes: RouteRow[] = [
      makeRoute("r1", trabalho.id, casa.id, T0),
    ];

    const res = resolveGotoOrigin({
      destinationPlaceId: casa.id,
      places: [casa, trabalho],
      routes,
      lastOriginMap: {},
    });

    expect(res.kind).toBe("resolved");
    if (res.kind === "resolved") {
      expect(res.originPlaceId).toBe(trabalho.id);
    }
  });
});
