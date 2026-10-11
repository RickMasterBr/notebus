/**
 * Nome e apelidos do ponto na folha do Ponto (E-08 bloco 5, item 1). Puro: sem React.
 * O nome guardado na pilha de folhas (`stack.ts`) e o do snapshot dos horários ficam velhos depois de editar o ponto;
 * o índice da busca é recarregado a cada gravação, então ele manda e o resto é reserva.
 *
 * Exemplo: o ponto foi renomeado de "Largo Velho" para "Largo Novo" → `stopNameFor(index, id, "Largo Velho")` = "Largo Novo".
 */
import type { StopIndexState } from "./StopIndexProvider";

type IndexLike = Pick<StopIndexState, "status"> & { stops?: readonly { id: string; name: string; aliases: readonly string[] }[] };

export function stopNameFor(index: IndexLike, stopId: string, fallback: string): string {
  if (index.status !== "ready") return fallback;
  return index.stops?.find((s) => s.id === stopId)?.name ?? fallback;
}

/** Linha de apelidos sob o cartão do ponto: "shopping · ESTG". `null` quando não há apelido (a linha não aparece). */
export function aliasesLine(index: IndexLike, stopId: string): string | null {
  if (index.status !== "ready") return null;
  const aliases = index.stops?.find((s) => s.id === stopId)?.aliases ?? [];
  return aliases.length > 0 ? aliases.join(" · ") : null;
}
