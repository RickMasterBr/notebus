/**
 * Textos do cartão de ponto, só pelo catálogo (RNF-06): o que se vê e o que o VoiceOver lê (4.6 §5.2, D-046).
 * Sem React: testado no Node.
 */
import { type MessageKey, t } from "../i18n";
import type { CardReason, NextBus, NextDay, NoBus, StopCard, StopCardLine } from "./stopCard";

const WEEKDAY_KEYS = [
  "common.weekday.0", "common.weekday.1", "common.weekday.2", "common.weekday.3",
  "common.weekday.4", "common.weekday.5", "common.weekday.6",
] as const satisfies readonly MessageKey[];

const MONTH_KEYS = [
  "common.month.1", "common.month.2", "common.month.3", "common.month.4", "common.month.5", "common.month.6",
  "common.month.7", "common.month.8", "common.month.9", "common.month.10", "common.month.11", "common.month.12",
] as const satisfies readonly MessageKey[];

/** "julho e agosto"; com três ou mais, "junho, julho e agosto". */
export function monthsText(months: readonly number[]): string {
  const names = months.map((m) => t(MONTH_KEYS[m - 1]!));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${t("common.list.and")} ${names[names.length - 1]}`;
}

export function reasonText(reason: CardReason): string {
  switch (reason.kind) {
    case "sunday_holiday":
      return t("sheet_stop.no_service.sunday_holiday");
    case "weekdays_only":
      return t("sheet_stop.no_service.weekdays_only");
    case "no_table":
      return t("sheet_stop.no_service.no_table");
    case "season":
      return t("sheet_stop.no_service.season", { months: monthsText(reason.months) });
  }
}

export function nextDayText(state: NextDay): string {
  return t("sheet_stop.next_day", { weekday: t(WEEKDAY_KEYS[state.weekday]!), time: state.time });
}

export function busEtaText(state: NextBus): string {
  return t("home.stop_card.bus_eta", { time: state.time, range: `${state.rangeStart}–${state.rangeEnd}` });
}

/** "Pode passar a qualquer momento, até 08:16" (D-146): o "esteja no ponto às" já passou, o fim da faixa não. */
export function mayPassNowText(rangeEnd: string): string {
  return t("sheet_stop.may_pass_now", { time: rangeEnd });
}

export function directionText(destination: string): string {
  return t("sheet_stop.line_direction", { destination });
}

const CONFIDENCE_KEYS = {
  high: "common.confidence.high",
  medium: "common.confidence.medium",
  low: "common.confidence.low",
  estimated: "common.confidence.estimated",
} as const satisfies Record<NextBus["confidence"], MessageKey>;

export function confidenceText(confidence: NextBus["confidence"]): string {
  return t(CONFIDENCE_KEYS[confidence]);
}

/** As frases (sem o número da linha) que descrevem o estado da linha, na ordem em que se lê. */
function stateParts(state: NextBus | NextDay | NoBus): string[] {
  switch (state.status) {
    case "next":
      return [
        t("home.stop_card.a11y.next_bus", { time: state.time }),
        state.mayPassNow ? mayPassNowText(state.rangeEnd) : t("home.stop_card.a11y.be_at", { time: state.beAtStop }),
        confidenceText(state.confidence),
      ];
    case "later":
      return [...(state.reason ? [reasonText(state.reason)] : []), nextDayText(state)];
    case "none":
      return state.reason ? [reasonText(state.reason)] : [];
  }
}

/** "Linha 1, para Estação, próximo às 08:10, esteja no ponto às 08:06, estimado". */
export function lineA11y(line: StopCardLine): string {
  return [
    t("common.line.a11y", { line: line.code }),
    ...(line.destination ? [t("home.stop_card.a11y.destination", { destination: line.destination })] : []),
    ...stateParts(line.state),
  ].join(", ");
}

/** O cartão é lido como um bloco: o ponto, depois cada linha (4.6 §5.2; ordem de leitura do prompt do bloco 3c). */
export function cardA11y(card: StopCard): string {
  return [card.name, ...card.lines.map(lineA11y)].join(". ");
}
