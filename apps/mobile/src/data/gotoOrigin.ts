/**
 * Regra de resolução da origem no TL-04 (D-175).
 *
 * 1. Escolha salva tem precedência (chave goto_last_origin).
 * 2. Sem escolha salva: lugar chamado 'Casa' (case-insensitive) vence.
 * 3. Sem 'Casa': primeiro trajeto que chega ao destino (ordenado por opções / criação).
 * 4. Sem nenhum trajeto para o destino: fallback para editor (kind: "no_route").
 */
import type { OptionRow, PlaceRow, RouteRow } from "../db/places";

export interface ResolveOriginInput {
  destinationPlaceId: string;
  places: readonly PlaceRow[];
  routes: readonly RouteRow[];
  options?: readonly OptionRow[];
  lastOriginMap?: Record<string, string>;
}

export type ResolveOriginResult =
  | {
      kind: "resolved";
      originPlaceId: string;
      originPlace: PlaceRow;
      route?: RouteRow;
    }
  | {
      kind: "no_route";
    };

export function resolveGotoOrigin(input: ResolveOriginInput): ResolveOriginResult {
  const { destinationPlaceId, places, routes, options = [], lastOriginMap = {} } = input;

  const activePlaces = places.filter((p) => p.deletedAt === null);
  const activeRoutesToDest = routes.filter(
    (r) => r.destinationPlaceId === destinationPlaceId && r.deletedAt === null,
  );

  // 1.4: Se nenhum trajeto chega ao destino -> fallback para editor
  if (activeRoutesToDest.length === 0) {
    return { kind: "no_route" };
  }

  // 1.1: Escolha salva tem precedência
  const savedOriginId = lastOriginMap[destinationPlaceId];
  if (savedOriginId && savedOriginId !== destinationPlaceId) {
    const savedPlace = activePlaces.find((p) => p.id === savedOriginId);
    if (savedPlace) {
      const route = activeRoutesToDest.find((r) => r.originPlaceId === savedOriginId);
      return {
        kind: "resolved",
        originPlaceId: savedPlace.id,
        originPlace: savedPlace,
        route,
      };
    }
  }

  // 1.2: Sem escolha salva: lugar chamado 'Casa' (case-insensitive) vence
  const casaPlace = activePlaces.find(
    (p) => p.id !== destinationPlaceId && p.name.trim().toLowerCase() === "casa",
  );
  if (casaPlace) {
    const route = activeRoutesToDest.find((r) => r.originPlaceId === casaPlace.id);
    return {
      kind: "resolved",
      originPlaceId: casaPlace.id,
      originPlace: casaPlace,
      route,
    };
  }

  // 1.3: Sem 'Casa': primeiro trajeto cadastrado que chega ao destino
  // Ordena por opções existentes (rotas com opções primeiro), depois por data de criação
  const sortedRoutes = [...activeRoutesToDest].sort((a, b) => {
    const aOpts = options.filter((o) => o.routeId === a.id && o.deletedAt === null).length;
    const bOpts = options.filter((o) => o.routeId === b.id && o.deletedAt === null).length;
    if (aOpts > 0 && bOpts === 0) return -1;
    if (bOpts > 0 && aOpts === 0) return 1;
    return a.createdAt - b.createdAt;
  });

  for (const r of sortedRoutes) {
    const originPlace = activePlaces.find((p) => p.id === r.originPlaceId);
    if (originPlace) {
      return {
        kind: "resolved",
        originPlaceId: originPlace.id,
        originPlace,
        route: r,
      };
    }
  }

  return { kind: "no_route" };
}
