/**
 * Abertura de "Ir para X" ou criação de nova opção quando o destino não tem trajetos (E-05 Bloco 3, D-175).
 *
 * Se o destino tem trajetos cadastrados: abre TL-04 (folha `goto`).
 * Se NÃO tem trajetos:
 *   - Resolve uma origem ("Casa" se existir, ou o primeiro outro lugar).
 *   - Cria o trajeto (origem → destino) via `ensureRoute`.
 *   - Abre o editor de opções (folha `option`) com origem e destino pré-preenchidos.
 *   - Se não houver nenhum outro lugar cadastrado, abre TL-04 para exibir o estado de sem trajetos (T-50).
 */
import type { SheetAction } from "../sheets/stack";

export interface NavigationPlaces {
  places: readonly { id: string; name: string; deletedAt: number | null }[];
  routes: readonly { id: string; destinationPlaceId: string; deletedAt: number | null }[];
  options?: readonly { id: string; routeId: string; deletedAt: number | null }[];
  ensureRoute?: (originPlaceId: string, destinationPlaceId: string) => Promise<{ id: string }>;
}

export async function openGotoOrNewOption(
  dispatch: (action: SheetAction) => void,
  places: NavigationPlaces,
  destinationPlaceId: string,
): Promise<void> {
  const routesToDest = places.routes.filter(
    (r) =>
      r.destinationPlaceId === destinationPlaceId &&
      r.deletedAt === null &&
      (!places.options || places.options.some((o) => o.routeId === r.id && o.deletedAt === null)),
  );

  if (routesToDest.length > 0) {
    dispatch({ type: "push", sheet: { kind: "goto", destinationPlaceId } });
    return;
  }

  // Sem trajeto até o destino: resolver origem e abrir editor de opção
  const otherPlaces = places.places.filter(
    (p) => p.id !== destinationPlaceId && p.deletedAt === null,
  );

  const casa = otherPlaces.find((p) => p.name.trim().toLowerCase() === "casa");
  const origin = casa ?? otherPlaces[0];

  if (origin) {
    dispatch({
      type: "push",
      sheet: {
        kind: "option",
        originPlaceId: origin.id,
        destinationPlaceId,
      },
    });
  } else {
    // Sem nenhum outro lugar: abre a tela goto para exibir o motivo de sem opções (T-50)
    dispatch({ type: "push", sheet: { kind: "goto", destinationPlaceId } });
  }
}
