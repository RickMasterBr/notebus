/**
 * Dados da TL-05 "Daqui para a frente" (E-02 bloco 5a; plano §3.5, §3.6, §4.3; 4.1 TL-05; 4.6 §3.9): para uma viagem e
 * a posição tocada, as paragens dali em diante até o fim da viagem, cada uma com horário esperado, número da passagem,
 * se é ponto de controle, se é o mesmo ponto físico de onde se tocou ("↺ volta aqui") e se é a última; mais o que a
 * frase-resumo pede (próximos pontos de controle, até 3, e a primeira volta a este ponto).
 *
 * Puro, nos moldes de `stopDay.ts`. As contas (horário-base, faixa, número, "volta aqui") são do domínio
 * (`aheadFrom`, `baseTimeAt`, `passageInfo`); o arredondamento é o da D-092 (`displayCenter`). Nada aqui lê o relógio
 * nem faz hora de Lisboa (D-093): o horário de uma paragem é o minuto de serviço da viagem, que vira "HH:MM" pelo
 * `clockText`. Por isso a função não recebe o "agora" nem o tipo de dia: a lista é a mesma em qualquer dia.
 *
 * `shiftMinutes` (padrão 0) soma minutos a todos os horários da lista. Fica **sem uso** até a E-03 ligar a D-070
 * (previsão dentro da viagem em curso pelo último desvio).
 */
import {
  type BaseKind,
  type Confidence,
  aheadFrom,
  baseTimeAt,
  displayCenter,
  expectedTime,
  passageInfo,
  timepointPositions,
} from "@notebus/domain";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

export interface AheadStopRow {
  position: number;
  name: string;
  /** "HH:MM", o centro arredondado ao minuto mais próximo (D-092). */
  time: string;
  rangeStart: string;
  rangeEnd: string;
  /** `official` e `declared` aparecem sem til; `interpolated` com `~` (4.6 §4). */
  kind: BaseKind;
  confidence: Confidence;
  isTimepoint: boolean;
  /** 1ª, 2ª, 3ª vez deste ponto físico no percurso; `null` se o percurso passa ali uma vez só (D-094). */
  number: number | null;
  /** O mesmo ponto físico de onde se tocou: "↺ volta aqui". */
  returnsHere: boolean;
  /** A última paragem da viagem ("fim"). */
  isLast: boolean;
}

export interface AheadPlace {
  name: string;
  time: string;
}

export interface Ahead {
  tripId: string;
  line: { code: string; color: string } | null;
  /** Horário de saída da viagem ("viagem das 08:10"): o da primeira posição dela. */
  tripStart: string;
  /** A passagem tocada ("você"). */
  here: AheadStopRow;
  /** As paragens depois dela, em ordem, até o fim da viagem. Vazio quando a viagem termina aqui. */
  stops: AheadStopRow[];
  /** Os próximos pontos de controle (até 3), para a frase-resumo. */
  nextTimepoints: AheadPlace[];
  /** A primeira volta a este ponto físico, ou `null` se a viagem não volta aqui. */
  firstReturn: AheadPlace | null;
  isFirst: boolean;
  isLast: boolean;
}

export interface AheadOptions {
  /** D-070, E-03. Padrão 0. */
  shiftMinutes?: number;
}

/** `null` se a viagem, a posição ou o percurso não existem nos dados (viagem apagada, importação trocada). */
export function buildAhead(tripId: string, position: number, data: ScheduleSnapshot, options: AheadOptions = {}): Ahead | null {
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const pattern = data.patterns.find((p) => p.id === trip.patternId);
  if (!pattern || !pattern.stops.some((s) => s.position === position)) return null;
  const shiftMinutes = options.shiftMinutes ?? 0;

  const timepoints = timepointPositions(
    pattern,
    data.trips.filter((t) => t.patternId === pattern.id),
  );
  const nameAt = new Map(pattern.stops.map((s) => [s.position, data.stopNames.get(s.stopId) ?? ""]));
  const result = aheadFrom(pattern, timepoints, trip, position, { shiftMinutes });
  const startBase = baseTimeAt(trip, trip.firstPosition);
  const rawHere = baseTimeAt(trip, position);
  if (!startBase || !rawHere) return null; // a viagem não passa na posição (fora do trecho da viagem parcial)

  const row = (
    pos: number,
    base: { minute: number; kind: BaseKind },
    expected: { rangeStart: number; rangeEnd: number; confidence: Confidence },
    extra: Pick<AheadStopRow, "isTimepoint" | "number" | "returnsHere">,
  ): AheadStopRow => ({
    position: pos,
    name: nameAt.get(pos) ?? "",
    time: clockText(displayCenter(base.minute)),
    rangeStart: clockText(displayCenter(expected.rangeStart)),
    rangeEnd: clockText(displayCenter(expected.rangeEnd)),
    kind: base.kind,
    confidence: expected.confidence,
    isLast: pos === trip.lastPosition,
    ...extra,
  });
  const place = (s: { info: { position: number }; base: { minute: number } }): AheadPlace => ({
    name: nameAt.get(s.info.position) ?? "",
    time: clockText(displayCenter(s.base.minute)),
  });

  const stops = result.stops.map((s) =>
    row(s.info.position, s.base, s.expected, { isTimepoint: s.isTimepoint, number: s.info.number, returnsHere: s.returnsHere }),
  );
  // A passagem tocada: o horário dela vem do mesmo cálculo (o domínio devolve só as paragens depois dela).
  const hereBase = { position, minute: rawHere.minute + shiftMinutes, kind: rawHere.kind };
  const here = row(position, hereBase, expectedTime(hereBase, []), {
    isTimepoint: timepoints.has(position),
    number: passageInfo(pattern, timepoints, position).number,
    returnsHere: false,
  });

  const line = data.patternLine.get(pattern.id) ?? null;
  return {
    tripId,
    line: line ? { code: line.code, color: line.color } : null,
    tripStart: clockText(displayCenter(startBase.minute + shiftMinutes)),
    here,
    stops,
    nextTimepoints: result.nextTimepoints.map(place),
    firstReturn: result.firstReturn ? place(result.firstReturn) : null,
    isFirst: position === trip.firstPosition,
    isLast: position === trip.lastPosition,
  };
}

/** Uma linha da linha do tempo: uma paragem ou uma lacuna "+ N paragens" (`terminal_detail.gap`). */
export type TimelineItem = { kind: "stop"; row: AheadStopRow } | { kind: "gap"; count: number };

/**
 * Quais paragens aparecem e quais viram "+ N paragens" (canvas: "você", as paragens até o primeiro ponto de controle,
 * "+ 11 paragens", e o fim). Regra: tudo até o **primeiro ponto de controle** fica aberto (é o que está perto);
 * depois, ficam abertas os pontos de controle, a que "volta aqui" e a última; cada sequência de **2 ou mais**
 * paragens comuns entre elas vira uma lacuna (uma só aparece como paragem: ocupa o mesmo lugar que a lacuna).
 */
export function timelineItems(stops: readonly AheadStopRow[]): TimelineItem[] {
  const firstControl = stops.findIndex((s) => s.isTimepoint);
  const openUntil = firstControl === -1 ? stops.length - 1 : firstControl;
  const items: TimelineItem[] = [];
  let run: AheadStopRow[] = [];
  const flush = () => {
    if (run.length >= 2) items.push({ kind: "gap", count: run.length });
    else for (const row of run) items.push({ kind: "stop", row });
    run = [];
  };
  stops.forEach((row, i) => {
    if (i <= openUntil || row.isTimepoint || row.returnsHere || row.isLast) {
      flush();
      items.push({ kind: "stop", row });
    } else {
      run.push(row);
    }
  });
  flush();
  return items;
}
