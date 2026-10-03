/**
 * Regras do Início ligadas aos últimos pontos abertos. Lógica pura, sem React.
 *
 * Exemplo: abriu o app com 2 pontos nos recentes → a folha começa no detent médio (D-141);
 * sem nenhum → no pequeno. O "Perto de você" mostra só os 3 primeiros de até 10 (D-144).
 */
import type { Detent } from "../sheets/stack";

/** Quantos cartões o "Perto de você" mostra (D-133, D-144). */
export const NEARBY_MAX = 3;

/** Detent da folha inicial na abertura a frio (D-141): médio se há recentes, pequeno se não. */
export function initialDetent(recentCount: number): Detent {
  return recentCount > 0 ? 1 : 0;
}

/** Os que viram cartão: os `NEARBY_MAX` primeiros. */
export function nearbyIds(ids: readonly string[]): string[] {
  return ids.slice(0, NEARBY_MAX);
}
