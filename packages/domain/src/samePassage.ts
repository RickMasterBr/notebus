import type { PatternData } from "./passages";

/**
 * A posição do percurso novo que é a mesma passagem da `position` do antigo: o mesmo ponto, na mesma ordem
 * (a k-ésima vez que o ponto aparece, por ordem de posição; vale para o percurso circular). `null` se a posição não
 * existe no antigo, se o ponto não está no novo ou se o novo não tem a k-ésima passagem.
 */
export function samePassage(oldPattern: PatternData, position: number, newPattern: PatternData): number | null {
  const byPosition = (p: PatternData) => [...p.stops].sort((a, b) => a.position - b.position);
  const oldStops = byPosition(oldPattern);
  const at = oldStops.findIndex((s) => s.position === position);
  if (at === -1) return null;
  const stopId = oldStops[at]!.stopId;
  const k = oldStops.slice(0, at).filter((s) => s.stopId === stopId).length;
  return byPosition(newPattern).filter((s) => s.stopId === stopId)[k]?.position ?? null;
}
