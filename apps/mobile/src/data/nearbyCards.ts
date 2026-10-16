/**
 * Escolhe os cartões da seção "Perto de você" (FN-29; plano §3.4 e D-144).
 *
 * Se a posição acha pontos mas nenhum deles gera cartão (ponto sem horário no calendário
 * ou sem serviço no instante), faz fallback para os pontos recentes.
 * Lógica pura, sem React.
 */
import { NEARBY_MAX, nearbyIds } from "./homeStart";

export type NearbySource = "fix" | "recent" | "none";

export interface PickedNearbyCards<T> {
  cards: T[];
  source: NearbySource;
}

export function pickNearbyCards<T>(
  byFixIds: readonly string[],
  recentIds: readonly string[],
  buildCard: (stopId: string) => T | null,
): PickedNearbyCards<T> {
  const fixLimit = byFixIds.slice(0, NEARBY_MAX);
  const fixCards: T[] = [];
  for (const id of fixLimit) {
    const card = buildCard(id);
    if (card != null) {
      fixCards.push(card);
    }
  }
  if (fixCards.length > 0) {
    return { cards: fixCards, source: "fix" };
  }

  const recLimit = nearbyIds(recentIds);
  const recentCards: T[] = [];
  for (const id of recLimit) {
    const card = buildCard(id);
    if (card != null) {
      recentCards.push(card);
    }
  }
  if (recentCards.length > 0) {
    return { cards: recentCards, source: "recent" };
  }

  return { cards: [], source: "none" };
}
