/**
 * Textos da folha do ponto (TL-02), só pelo catálogo (RNF-06): o que se vê e o que o VoiceOver lê de cada passagem
 * (4.6 §3.6, §3.9, §3.12, §5.2). Sem React: testado no Node.
 */
import type { DayTypeCode } from "@notebus/domain";
import { t } from "../i18n";
import type { DayLine, DayLineEmpty, PassageRow } from "./stopDay";
import { confidenceText, directionText, mayPassNowText, nextDayText, reasonText } from "./stopCardText";

const cap = (text: string) => text.charAt(0).toLocaleUpperCase("pt") + text.slice(1);
const lower = (text: string) => text.charAt(0).toLocaleLowerCase("pt") + text.slice(1);

/** Chip de tipo de dia: o do dia de hoje diz "Hoje · dia útil"; os outros, só o tipo ("Sábado"). */
export function dayTypeChipText(dayType: DayTypeCode, isToday: boolean): string {
  const label = t(`common.day_type.${dayType}`);
  return isToday ? `${t("common.today")} · ${lower(label)}` : cap(label);
}

/** "~08:13": o horário esperado (centro). */
export const rowTimeText = (row: PassageRow) => `~${row.time}`;

/** "08:09–08:18" (en-dash, 4.6 §4). */
export const rowRangeText = (row: Pick<PassageRow, "rangeStart" | "rangeEnd">) => `${row.rangeStart}–${row.rangeEnd}`;

const ordinal = (n: number) => `${n}ª`;

/**
 * As frases de apoio da passagem, na ordem em que se lê (4.6 §3.9, D-094): "começa aqui · Campus 08:54" na primeira
 * posição da viagem; "2ª passagem · veio Estação" nas outras passagens de um ponto que a linha repete; "fim do
 * percurso · não embarque" na última. Passagem única no meio do percurso: nenhuma.
 */
export function passageNotes(row: PassageRow): string[] {
  const notes: string[] = [];
  if (row.isFirst) {
    if (row.destination) notes.push(t("terminal.trip.starts_here", { place: row.destination.name, time: row.destination.time }));
  } else if (row.number !== null && row.origin !== null) {
    notes.push(
      row.number === 2
        ? t("terminal.trip.second_pass", { origin: row.origin })
        : t("terminal.trip.nth_pass", { ordinal: ordinal(row.number), origin: row.origin }),
    );
  }
  if (row.isLast) notes.push(t("sheet_stop.end_of_route"));
  return notes;
}

/** O que a linha do cabeçalho do grupo diz: "→ Estação" e, se a linha acaba neste ponto, "(fim do percurso)". */
export function lineHeaderText(line: Pick<DayLine, "destination" | "endsHere">): { direction: string | null; end: string | null } {
  return {
    direction: line.destination ? directionText(line.destination) : null,
    end: line.endsHere ? t("sheet_stop.end_of_route_short") : null,
  };
}

/** Linha sem passagens (nunca uma lista vazia): o porquê e o próximo dia com serviço. */
export function emptyTexts(empty: DayLineEmpty): { reason: string; next: string | null } {
  return {
    reason: reasonText(empty.reason ?? { kind: "no_table" }),
    next: empty.next ? nextDayText({ status: "later", reason: null, ...empty.next }) : null,
  };
}

/**
 * Cada passagem é lida como um bloco: "Linha 5, para Estádio, passagem 2, próximo às 08:12, faixa 08:08 a 08:16,
 * esteja no ponto às 08:06, estimado" (prompt do bloco 4, 4.6 §5.2).
 */
export function rowA11y(line: Pick<DayLine, "code">, row: PassageRow): string {
  const parts = [t("common.line.a11y", { line: line.code })];
  if (row.tripDestination) parts.push(t("home.stop_card.a11y.destination", { destination: row.tripDestination }));
  if (row.number !== null) parts.push(t("sheet_stop.a11y.passage", { number: row.number }));
  if (row.isFirst) {
    if (row.destination) parts.push(t("terminal.trip.starts_here", { place: row.destination.name, time: row.destination.time }));
  } else if (row.number !== null && row.origin !== null) {
    parts.push(t("sheet_stop.a11y.came_from", { origin: row.origin }));
  }
  parts.push(
    row.isNext ? t("home.stop_card.a11y.next_bus", { time: row.time }) : t("sheet_stop.a11y.at", { time: row.time }),
    t("sheet_stop.a11y.range", { start: row.rangeStart, end: row.rangeEnd }),
  );
  if (row.isLast) parts.push(t("sheet_stop.end_of_route"));
  else parts.push(row.mayPassNow ? mayPassNowText(row.rangeEnd) : t("home.stop_card.a11y.be_at", { time: row.beAtStop }));
  parts.push(confidenceText(row.confidence));
  return parts.join(", ");
}
