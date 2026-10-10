/**
 * Funções puras de registro de eventos de diagnóstico (D-150, E-07 Bloco 9).
 * TypeScript puro, testado no Node.
 */

export type DiagEvent = { at: number; text: string };

/** Guarda os últimos `max` eventos, do mais antigo ao mais novo. Imutável: devolve uma lista nova. */
export function pushDiagEvent(
  log: readonly DiagEvent[],
  event: DiagEvent,
  max: number,
): DiagEvent[] {
  if (max <= 0) return [];
  const next = [...log, event];
  if (next.length > max) {
    return next.slice(-max);
  }
  return next;
}

/** Uma linha por evento: segundos desde `now` ("há 3 s: texto"). */
export function formatDiagLog(log: readonly DiagEvent[], now: number): string[] {
  return log.map((item) => {
    const elapsedSec = Math.max(0, Math.floor((now - item.at) / 1000));
    return `há ${elapsedSec} s: ${item.text}`;
  });
}

/** A camada da Home recebe toque? Mesma regra que SheetHost usa: sem toque quando há folha empilhada. */
export function homeLayerPointerEvents(stackedCount: number): "none" | "box-none" {
  return stackedCount > 0 ? "none" : "box-none";
}
