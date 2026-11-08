/**
 * O cabeçalho e o fim da Tela de viagem (D-392): "Chega em ~32 min", a próxima paragem e
 * "Viagem concluída · 32 min · 3 min depois da tabela". Puro: sem relógio, sem banco e sem frases
 * (devolve dados e códigos; o texto é do catálogo, na tela do 04).
 */
import type { AlightRow } from "./rideView";
import type { TripSummary } from "./tripSummary";

export type TripHeader =
  | { kind: "arrives"; minutes: number; remaining: number }
  | { kind: "ongoing"; nextStopName: string; remaining: number }
  | { kind: "unknown"; remaining: number };

/**
 * O cabeçalho da viagem. Com descida escolhida conta os minutos até ela (nunca negativos); sem escolha
 * mostra a próxima paragem do resumo; sem resumo não sabe o destino. `remaining` é o número de paragens
 * que faltam até o alvo (`targetPosition` ou o fim do percurso), contando as que ainda não passaram.
 */
export function tripHeader(
  summary: TripSummary | null,
  rows: readonly AlightRow[],
  targetPosition: number | null,
  nowMinute: number | null,
): TripHeader {
  const target = targetPosition ?? rows[rows.length - 1]?.position ?? null;
  const remaining = rows.filter(
    (row) => (nowMinute === null || row.minute > nowMinute) && (target === null || row.position <= target),
  ).length;

  if (summary === null) return { kind: "unknown", remaining };
  if (summary.kind === "chosen") {
    const minutes = nowMinute === null ? 0 : Math.max(0, Math.round(summary.row.minute - nowMinute));
    return { kind: "arrives", minutes, remaining };
  }
  return { kind: "ongoing", nextStopName: summary.row.name, remaining };
}

export interface TripDoneDelta {
  direction: "late" | "early" | "none";
  /** Minutos de diferença, sem sinal (o sentido está em `direction`). */
  minutes: number;
}

export interface TripDone {
  /** Duração da viagem, arredondada ao minuto. */
  minutes: number;
  /** A diferença para a tabela; `null` sem atraso conhecido ou sem minuto de descida. */
  delta: TripDoneDelta | null;
}

/**
 * O fim da viagem: quanto durou e quanto diferiu da tabela. A hora esperada da paragem de descida é a da
 * tabela (`alightRow.minute`) já deslocada pelo atraso da viagem (`rideDeviation`), como na lista de paragens.
 */
export function tripDone(input: {
  boardedAt: number;
  alightedAt: number;
  alightRow: AlightRow;
  rideDeviation: number | null;
  alightedMinute: number | null;
}): TripDone {
  const minutes = Math.round((input.alightedAt - input.boardedAt) / 60_000);
  if (input.rideDeviation === null || input.alightedMinute === null) return { minutes, delta: null };

  const difference = Math.round(input.alightedMinute - (input.alightRow.minute - input.rideDeviation));
  const direction = difference > 0 ? "late" : difference < 0 ? "early" : "none";
  return { minutes, delta: { direction, minutes: Math.abs(difference) } };
}
