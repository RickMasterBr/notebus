/**
 * Funções puras de registro de eventos de diagnóstico (D-150, E-07 Bloco 9).
 * TypeScript puro, testado no Node.
 */

export const SELECTOR_OPENED = "seletor aberto";
export const SELECTOR_CLOSED = "seletor fechado";

/**
 * Ativa a faixa de diagnóstico e seus registros somente quando o valor for a string exata "1".
 * Qualquer outro valor (undefined, "", "0", "true", etc.) retorna false.
 */
export function isDiagEnabled(value: string | undefined): boolean {
  return value === "1";
}

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
  if (log.length > 0) {
    const last = log[log.length - 1]!;
    const match = last.text.match(/^(.*) ×(\d+)$/);
    const baseText = match ? match[1]! : last.text;
    const count = match ? Number(match[2]!) : 1;
    if (baseText === event.text) {
      const merged: DiagEvent = { at: event.at, text: `${event.text} ×${count + 1}` };
      const replaced = [...log.slice(0, -1), merged];
      return replaced.length > max ? replaced.slice(-max) : replaced;
    }
  }
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

/** Quantidade de eventos recentes exibidos na faixa superior de diagnóstico. */
export const DIAG_STRIP_EVENT_COUNT = 12;

/** Fração máxima da altura da tela que a faixa de diagnóstico pode ocupar. */
export const DIAG_STRIP_MAX_HEIGHT_RATIO = 0.45;
const DIAG_STRIP_LINE_HEIGHT = 12;
const DIAG_STRIP_CHROME_PX = 6;

/** Formata no máximo 14 linhas de texto para a faixa superior de diagnóstico, cortando os eventos mais antigos se passar de 45% da tela. */
export function diagStripLines(input: {
  sha: string;
  homePointer: "none" | "box-none";
  picker: "aberto" | "fechado";
  stack: readonly { kind: string; id: number }[];
  events: readonly DiagEvent[];
  now: number;
  windowHeight?: number;
}): string[] {
  const line1 = `[DIAG] ${input.sha} · home=${input.homePointer} · seletor=${input.picker}`;
  const top = input.stack[input.stack.length - 1];
  const topText = top ? `${top.kind}#${top.id}` : "nenhum";
  const stackList = input.stack.map((e) => `${e.kind}#${e.id}`).join(" > ");
  const line2 = `topo=${topText} · pilha=[${stackList}]`;
  let maxEvents = DIAG_STRIP_EVENT_COUNT;
  if (input.windowHeight !== undefined && input.windowHeight > 0) {
    const maxPx = Math.floor(input.windowHeight * DIAG_STRIP_MAX_HEIGHT_RATIO);
    const maxLines = Math.max(2, Math.floor((maxPx - DIAG_STRIP_CHROME_PX) / DIAG_STRIP_LINE_HEIGHT));
    maxEvents = Math.min(DIAG_STRIP_EVENT_COUNT, Math.max(0, maxLines - 2));
  }
  const recentEvents = maxEvents > 0 ? input.events.slice(-maxEvents) : [];
  const eventLines = formatDiagLog(recentEvents, input.now);
  return [line1, line2, ...eventLines];
}

