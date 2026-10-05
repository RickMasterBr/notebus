/**
 * Textos da TL-05 "Daqui para a frente", só pelo catálogo (RNF-06; 4.6 §3.9, §5.2 D-047): título e contexto, a
 * frase-resumo (com os trechos em negrito do catálogo marcados por `**`), a etiqueta e a leitura do VoiceOver de cada
 * paragem. Sem React: testado no Node. As chaves marcadas "Q-72" em `pt-BR.ts` ainda esperam o ok do Rick.
 */
import { t } from "../i18n";
import type { Ahead, AheadStopRow } from "./ahead";

export interface TextSegment {
  text: string;
  bold: boolean;
}

/**
 * Largura mínima da coluna de hora da TL-05 (Item 7) para acomodar "~HH:MM"
 * com algarismos tabulares e negrito sem quebrar em duas linhas.
 */
export const AHEAD_TIME_WIDTH = 60;

/** Parte "texto **negrito** texto" do catálogo em trechos (a 4.6 marca o negrito com `**`). */
export function boldSegments(text: string): TextSegment[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((segment) => segment.text.length > 0);
}

const ordinal = (n: number) => `${n}ª`;

/** "viagem das 08:10 · Estádio, 2ª passagem"; passagem única (ou sem número): "viagem das 08:10 · Arrabalde". */
export function contextText(ahead: Ahead): string {
  const { here, tripStart } = ahead;
  return here.number === null
    ? t("terminal_detail.context_single", { time: tripStart, place: here.name })
    : t("terminal_detail.context", { time: tripStart, place: here.name, pass_ordinal: ordinal(here.number) });
}

/** "A", "A e B", "A, B e C". */
function placesText(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return t("terminal_detail.places_last", { rest: names.slice(0, -1).join(", "), last: names[names.length - 1]! });
}

/**
 * A frase-resumo: "**Está indo** para A, B e C. Depois **volta aqui às 09:30**." Os pontos de controle vêm do domínio
 * (até 3); sem volta, o segundo trecho não aparece; viagem que termina aqui não tem resumo (`null`).
 */
export function summaryText(ahead: Ahead): string | null {
  if (ahead.isLast) return null;
  const parts: string[] = [];
  if (ahead.nextTimepoints.length > 0) {
    parts.push(t("terminal_detail.narrative_going", { places: placesText(ahead.nextTimepoints.map((p) => p.name)) }));
  }
  if (ahead.firstReturn) parts.push(t("terminal_detail.narrative_return", { time: ahead.firstReturn.time }));
  return parts.length > 0 ? parts.join(" ") : null;
}

/** O que o VoiceOver lê da frase-resumo: o mesmo texto, sem as marcas de negrito. */
export const summaryPlain = (text: string) => text.replaceAll("**", "");

/** "~08:34" interpolado, "08:44" oficial (4.6 §4). */
export const stopTimeText = (row: Pick<AheadStopRow, "time" | "kind">) => (row.kind === "interpolated" ? `~${row.time}` : row.time);

/** A etiqueta à direita do nome: "↺ volta aqui · fim" (volta e é a última), "↺ volta aqui" (volta no meio); senão `null`. */
export function returnTag(row: Pick<AheadStopRow, "returnsHere" | "isLast">): string | null {
  if (!row.returnsHere) return null;
  return row.isLast ? t("terminal_detail.return_here") : t("terminal_detail.return_here_mid");
}

/**
 * Cada paragem é lida como um bloco (D-047): "08:44, Campus, ponto de controle, volta aqui · fim". A passagem tocada
 * leva "você" depois do nome.
 */
export function stopA11y(row: AheadStopRow, isHere: boolean): string {
  const parts = [row.time, row.name];
  if (isHere) parts.push(t("terminal_detail.you_are_here"));
  if (row.isTimepoint) parts.push(t("terminal_detail.a11y.timepoint"));
  const tag = returnTag(row);
  if (tag) parts.push(tag.replace("↺ ", ""));
  return parts.join(", ");
}

/** "+ 11 paragens". */
export const gapText = (count: number) => t("terminal_detail.gap", { count });
