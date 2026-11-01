/**
 * Chave de época da frase viva do Início (ideias 195 e 164).
 * A frase só é recalculada quando esta chave muda. Puro: sem React, sem relógio, sem banco.
 */
export interface HomePhraseEpochInput {
  /** Quantas vezes o app voltou a ficar ativo. */
  activeCount: number;
  /** boardingId do tripCard em andamento, ou null. */
  tripId: string | null;
  userName: string | null;
}

export function homePhraseEpochKey(input: HomePhraseEpochInput): string {
  return JSON.stringify([input.activeCount, input.tripId, input.userName]);
}
