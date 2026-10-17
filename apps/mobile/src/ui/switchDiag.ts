import { realNow } from "../data/clock";
import { recordDiagEvent } from "../sheets/diagScroll";

type Marks = { tap: number; render?: number; effect?: number };
const marks = new Map<string, Marks>();

/** Medição do toque até o efeito do interruptor (E-09 bloco 29, item 1a; bloco 30: sem callback de animação). Só é chamada com DIAG_SCROLL. */
export function markSwitchTap(label: string) {
  marks.set(label, { tap: realNow() });
}
export function markSwitchRender(label: string) {
  const m = marks.get(label);
  if (m && m.render === undefined) m.render = realNow();
  flushIfComplete(label);
}
export function markSwitchEffect(label: string) {
  const m = marks.get(label);
  if (m && m.effect === undefined) m.effect = realNow();
  flushIfComplete(label);
}
// O efeito do filho pode rodar antes do render do hook: a linha sai quando as duas marcas existem, em qualquer ordem.
function flushIfComplete(label: string) {
  const m = marks.get(label);
  if (!m || m.render === undefined || m.effect === undefined) return;
  marks.delete(label);
  recordDiagEvent(`sw ${label} resumo toque>render=${m.render - m.tap}ms toque>efeito=${m.effect - m.tap}ms`);
}
