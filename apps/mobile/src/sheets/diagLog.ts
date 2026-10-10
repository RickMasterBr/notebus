/**
 * Funções puras de registro de eventos de diagnóstico (D-150, E-07 Bloco 9).
 * TypeScript puro, testado no Node.
 */

export const SELECTOR_OPENED = "seletor aberto";
export const SELECTOR_CLOSED = "seletor fechado";

export type DiagEvent = { at: number; text: string };

export type DiagSnapshot = { events: readonly DiagEvent[]; picker: "aberto" | "fechado" };

export type DiagStore = {
  record(text: string, at: number): void;
  getSnapshot(): DiagSnapshot;
  subscribe(listener: () => void): () => void;
};

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

/** Cria um armazém de eventos e estado do seletor para consumo reativo (D-150, E-07 Bloco 9b). */
export function createDiagStore(max: number): DiagStore {
  let snapshot: DiagSnapshot = { events: [], picker: "fechado" };
  const listeners = new Set<() => void>();

  return {
    record(text: string, at: number): void {
      let nextPicker = snapshot.picker;
      if (text === SELECTOR_OPENED) nextPicker = "aberto";
      else if (text === SELECTOR_CLOSED) nextPicker = "fechado";

      snapshot = {
        events: pushDiagEvent(snapshot.events, { at, text }, max),
        picker: nextPicker,
      };

      const copy = Array.from(listeners);
      for (const listener of copy) {
        if (listeners.has(listener)) {
          listener();
        }
      }
    },
    getSnapshot(): DiagSnapshot {
      return snapshot;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Formata no máximo 4 linhas de texto para a faixa superior de diagnóstico. */
export function diagStripLines(input: {
  sha: string;
  homePointer: "none" | "box-none";
  picker: "aberto" | "fechado";
  stack: readonly { kind: string; id: number }[];
  events: readonly DiagEvent[];
  now: number;
}): string[] {
  const line1 = `[DIAG] ${input.sha} · home=${input.homePointer} · seletor=${input.picker}`;
  const top = input.stack[input.stack.length - 1];
  const topText = top ? `${top.kind}#${top.id}` : "nenhum";
  const stackList = input.stack.map((e) => `${e.kind}#${e.id}`).join(" > ");
  const line2 = `topo=${topText} · pilha=[${stackList}]`;
  const recentEvents = input.events.slice(-2);
  const eventLines = formatDiagLog(recentEvents, input.now);
  return [line1, line2, ...eventLines];
}

