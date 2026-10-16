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

export interface PhraseMountedInput {
  phrase: HomePhrase | null;
  inTrip: boolean;
}

/** Monta a frase quando ela existe e o usuário não está em viagem (E-09 Bloco 15, FN-15). */
export function phraseMounted({ phrase, inTrip }: PhraseMountedInput): boolean {
  return phrase !== null && !inTrip;
}

/** Ignora variação menor que 0,5 px para cortar qualquer laço de medida (E-09 Bloco 15, FN-15). */
export function nextPhraseHeight(prev: number, measured: number): number {
  if (Math.abs(prev - measured) < 0.5) return prev;
  return measured;
}
