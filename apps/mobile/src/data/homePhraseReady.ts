/**
 * Decisão pura sobre a prontidão dos dados para a frase viva do Início (E-08.5 Fechamento, Item 3b).
 * Puro: sem React, sem relógio, sem banco.
 */
export interface HomePhraseReadyInput {
  nameLoaded: boolean;
  placesReady: boolean;
  registroReady: boolean;
  scheduleReady: boolean;
  asyncDone: boolean;
}

export function homePhraseReady(input: HomePhraseReadyInput): boolean {
  return (
    input.nameLoaded &&
    input.placesReady &&
    input.registroReady &&
    input.scheduleReady &&
    input.asyncDone
  );
}
