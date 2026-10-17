import { realNow } from "../data/clock";
import { recordDiagEvent } from "../sheets/diagScroll";

type Marks = { tap: number; render?: number; effect?: number };
const marks = new Map<string, Marks>();

/** Medição do toque até a animação do interruptor (E-09 bloco 29, item 1a). Só é chamada com DIAG_SCROLL. */
export function markSwitchTap(label: string) {
  marks.set(label, { tap: realNow() });
}
export function markSwitchRender(label: string) {
  const m = marks.get(label);
  if (m && m.render === undefined) m.render = realNow();
}
export function markSwitchEffect(label: string) {
  const m = marks.get(label);
  if (m && m.effect === undefined) m.effect = realNow();
}
// O efeito do visual (filho) roda antes do efeito do hook (pai) no mesmo commit: Y pode sair levemente negativo, então vai a 0.
export function markSwitchDone(label: string, reduceMotion: boolean) {
  const m = marks.get(label);
  if (!m || m.render === undefined || m.effect === undefined) return;
  marks.delete(label);
  const anim = reduceMotion ? 0 : realNow() - m.effect;
  recordDiagEvent(`sw ${label} resumo toque>render=${m.render - m.tap}ms render>efeito=${Math.max(0, m.effect - m.render)}ms anim=${anim}ms`);
}
