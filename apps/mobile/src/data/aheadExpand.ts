/**
 * "+ N paragens" que expande no lugar (Q-101): dado o estado aberto ou fechado de cada lacuna, quais linhas a linha do tempo
 * mostra. Não muda **quais** paragens ficam escondidas (essa regra é `timelineItems`, em `ahead.ts`); só devolve as escondidas
 * quando a lacuna está aberta. Puro: sem React.
 */
import { type AheadStopRow, type TimelineItem, timelineItems } from "./ahead";

/** `id` é a posição da primeira paragem escondida: estável enquanto a viagem for a mesma. */
export type ShownItem =
  | { kind: "stop"; row: AheadStopRow }
  | { kind: "gap"; id: number; count: number; open: boolean };

/** A linha do tempo completa: "você" + as paragens, com cada lacuna aberta trocada pela lacuna e pelas paragens escondidas, em ordem. */
export function shownTimeline(here: AheadStopRow, stops: readonly AheadStopRow[], open: ReadonlySet<number>): ShownItem[] {
  const items: TimelineItem[] = timelineItems(stops);
  const shown: ShownItem[] = [{ kind: "stop", row: here }];
  let cursor = 0;
  for (const item of items) {
    if (item.kind === "stop") {
      shown.push(item);
      cursor += 1;
      continue;
    }
    const hidden = stops.slice(cursor, cursor + item.count);
    cursor += item.count;
    const id = hidden[0]?.position ?? cursor;
    const isOpen = open.has(id);
    shown.push({ kind: "gap", id, count: item.count, open: isOpen });
    if (isOpen) for (const row of hidden) shown.push({ kind: "stop", row });
  }
  return shown;
}

/** Tocar abre a lacuna fechada e fecha a aberta. Devolve um conjunto novo. */
export function toggleGap(open: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(open);
  if (!next.delete(id)) next.add(id);
  return next;
}
