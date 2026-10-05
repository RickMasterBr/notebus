/**
 * As filas de conferência (E-04 §4.2, D-057): quem lê é a TL-01 ("N registros para conferir") e a TL-08. Puro: sem banco
 * e sem relógio; recebe as linhas que `registro.load()` devolve (já sem as apagadas) e filtra de novo por segurança.
 *
 * Uma descida (`kind = alighted`) nunca entra: quem se confere é o embarque (D-072, a descida só é pista).
 */
import type { ObservationRow } from "./registro";

type Reviewable = Pick<ObservationRow, "kind" | "matchStatus" | "reviewDismissedAt" | "deletedAt" | "observedAt">;

const needsReview = (o: Reviewable) =>
  o.deletedAt == null && o.kind !== "alighted" && (o.matchStatus === "ambiguous" || o.matchStatus === "orphan");

/** Mais novo primeiro (desempate estável: a ordem de entrada). */
const newestFirst = <T extends Reviewable>(list: T[]) => [...list].sort((a, b) => b.observedAt - a.observedAt);

/** "Para conferir": `ambiguous` e `orphan` que você ainda não dispensou, do mais novo para o mais antigo. */
export function reviewQueue<T extends Reviewable>(observations: readonly T[]): T[] {
  return newestFirst(observations.filter((o) => needsReview(o) && o.reviewDismissedAt == null));
}

/** Chip "não conferido" (D-057): os dispensados com "Não sei", que continuam órfãos ou ambíguos e podem ser reabertos. */
export function notVerified<T extends Reviewable>(observations: readonly T[]): T[] {
  return newestFirst(observations.filter((o) => needsReview(o) && o.reviewDismissedAt != null));
}
