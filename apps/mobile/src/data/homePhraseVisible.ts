/**
 * Visibilidade da frase viva no Início (E-08.5 Bloco 17, Item 4.3, D-141, D-207).
 * Função pura: a frase não aparece no detent pequeno (D-141) e some assim que o usuário começa uma viagem.
 */
import type { HomePhrase } from "./homePhrase";

export interface PhraseVisibleInput {
  phrase: HomePhrase | null;
  inTrip: boolean;
  detent: number;
}

export function phraseVisible({ phrase, inTrip, detent }: PhraseVisibleInput): boolean {
  return phrase !== null && !inTrip && detent >= 1;
}
