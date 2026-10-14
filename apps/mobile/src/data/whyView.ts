import {
  type BaseKind,
  type Confidence,
  DOMAIN_CONFIG,
  type DayTypeCode,
  type EstimateLevel,
  type PassageRecord,
  baseTimeAt,
  dayOfWeek,
  displayCenter,
  estimateDeviation,
  expectedTime,
  lisbonWallClock,
  passageInfo,
  timepointPositions,
} from "@notebus/domain";
import { type MessageKey, t } from "../i18n";
import { buildAhead } from "./ahead";
import { contextText } from "./aheadText";
import { confidenceNext } from "./confidenceNext";
import { passageTarget } from "./records";
import type { LineInfo, ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";
import { confidenceText } from "./stopCardText";
import { rowTimeText } from "./stopDayText";

export interface BuildWhyInput {
  tripId: string;
  position: number;
  data: ScheduleSnapshot;
  records: readonly PassageRecord[];
  now: number;
  serviceDay: {
    date: string;
    dayType: DayTypeCode;
  };
}

export interface WhyRowView {
  label: string;
  value: string;
  detail: string;
  a11y: string;
}

export interface WhyTypicalView extends WhyRowView {
  range: string | null;
  confidence: Confidence | null;
}

export interface WhyCountView extends WhyRowView {
  count: number;
  level: EstimateLevel;
  levelText: string;
  nextText: string;
}

export interface WhyView {
  title: string;
  context: string;
  line: LineInfo;
  table: WhyRowView;
  typical: WhyTypicalView;
  count: WhyCountView;
  last: WhyRowView | null;
  footnote: string;
}

const SHORT_WEEKDAY_KEYS = [
  "common.weekday.short.0",
  "common.weekday.short.1",
  "common.weekday.short.2",
  "common.weekday.short.3",
  "common.weekday.short.4",
  "common.weekday.short.5",
  "common.weekday.short.6",
] as const satisfies readonly MessageKey[];

/**
 * Função pura que calcula o modelo de apresentação da folha "Por que este horário" (Item 2, D-188, D-197).
 * Devolve null se a viagem ou a posição não existem no snapshot.
 */
export function buildWhy(input: BuildWhyInput): WhyView | null {
  const { tripId, position, data, records, now, serviceDay } = input;
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;
  const base = baseTimeAt(trip, position);
  if (!base) return null;
  const pattern = data.patterns.find((p) => p.id === trip.patternId);
  if (!pattern) return null;

  const ahead = buildAhead(tripId, position, data, {
    learning: { records, now, serviceDay },
  });
  if (!ahead) return null;

  const target = passageTarget(data, trip.id, position, serviceDay.date, serviceDay.dayType);
  const expected = target
    ? expectedTime(base, records, { target, now, marginMinutes: data.margin })
    : expectedTime(base, []);

  // Título: "Por que ~08:14?" com a mesma regra do til do Ponto (rowTimeText)
  const title = t("why.title", {
    time: rowTimeText({ time: clockText(displayCenter(expected.center)) }),
  });

  // Contexto: mesmo texto da Daqui para a frente
  const context = contextText(ahead);

  // Linha 1: Na tabela
  const tableLabel = t("why.table.label");
  const tableValue =
    base.kind === "interpolated"
      ? `~${clockText(displayCenter(base.minute))}`
      : clockText(displayCenter(base.minute));

  const line: LineInfo = data.patternLine.get(pattern.id) ?? {
    code: ahead.line?.code ?? "",
    color: ahead.line?.color ?? "#000000",
    source: "official",
  };
  let tableDetail: string;
  if (base.kind === "official") {
    if (line.source === "user") {
      tableDetail = t("why.table.user_line");
    } else {
      tableDetail = t("why.table.official");
    }
  } else if (base.kind === "declared") {
    tableDetail = t("why.table.declared");
  } else {
    // interpolated
    const timepoints = timepointPositions(
      pattern,
      data.trips.filter((t) => t.patternId === pattern.id),
    );
    const info = passageInfo(pattern, timepoints, position);
    const originPos = info.origin ?? trip.firstPosition;
    const destPos = info.destination ?? trip.lastPosition;
    const originStopId = pattern.stops.find((s) => s.position === originPos)?.stopId;
    const destStopId = pattern.stops.find((s) => s.position === destPos)?.stopId;
    const fromName = originStopId ? (data.stopNames.get(originStopId) ?? "") : "";
    const destName = destStopId ? (data.stopNames.get(destStopId) ?? "") : "";
    const fromBase = baseTimeAt(trip, originPos);
    const destBase = baseTimeAt(trip, destPos);
    const fromTime = fromBase ? clockText(displayCenter(fromBase.minute)) : "";
    const destTime = destBase ? clockText(displayCenter(destBase.minute)) : "";
    tableDetail = t("why.table.interpolated", {
      from: fromName,
      from_time: fromTime,
      to: destName,
      to_time: destTime,
    });
  }

  const tableA11y = t("why.row.a11y", {
    label: tableLabel,
    value: tableValue,
    detail: tableDetail,
  });

  // Linha 2: Costuma passar
  const typicalLabel = t("why.typical.label");
  const typicalValue = rowTimeText({ time: clockText(displayCenter(expected.center)) });
  const estimate = target ? estimateDeviation(base.kind, records, target, now) : null;
  const count = estimate?.count ?? 0;

  let typicalDetail: string;
  let typicalRange: string | null = null;
  let typicalConfidence: Confidence | null = null;
  if (count === 0) {
    typicalDetail = t("why.typical.none", {
      minutes: DOMAIN_CONFIG.baseUncertainty[base.kind],
    });
  } else {
    const rangeStart = clockText(displayCenter(expected.rangeStart));
    const rangeEnd = clockText(displayCenter(expected.rangeEnd));
    typicalRange = `${rangeStart}–${rangeEnd}`;
    typicalConfidence = expected.confidence;
    typicalDetail = `${typicalRange} · ${confidenceText(expected.confidence)}`;
  }

  const typicalA11y = t("why.row.a11y", {
    label: typicalLabel,
    value: typicalValue,
    detail: typicalDetail,
  });

  // Linha 3: Anotações
  const countLabel = t("why.count.label");
  const countValue = String(count);
  const dayTypePlural =
    serviceDay.dayType === "weekday"
      ? t("why.day_type.weekday")
      : serviceDay.dayType === "saturday"
        ? t("why.day_type.saturday")
        : t("why.day_type.sunday_holiday");

  const level = estimate?.level ?? "none";
  let levelText: string;
  switch (level) {
    case "trip":
      levelText = t("why.count.level_trip", { day_type: dayTypePlural });
      break;
    case "stop":
      levelText = t("why.count.level_stop", { day_type: dayTypePlural });
      break;
    case "pattern":
      levelText = t("why.count.level_pattern", { day_type: dayTypePlural });
      break;
    case "none":
      levelText = t("why.count.none");
      break;
  }

  const next = confidenceNext(
    estimate ?? {
      confidence: "estimated",
      count: 0,
      recentCount: 0,
      rangeStart: expected.rangeStart,
      rangeEnd: expected.rangeEnd,
    },
  );
  const nextText = t(next.key, next.params);
  const countDetail = `${levelText}. ${nextText}`;
  const countA11y = t("why.row.a11y", {
    label: countLabel,
    value: countValue,
    detail: countDetail,
  });

  // Linha 4: Última (null se estimate.last === null)
  let lastRow: WhyRowView | null = null;
  if (estimate?.last) {
    const lastRec = estimate.last;
    const lastLabel = t("why.last.label");
    const lastValue = clockText(lisbonWallClock(lastRec.observedAt).minute);

    const dow = dayOfWeek(lastRec.serviceDate);
    const weekday = t(SHORT_WEEKDAY_KEYS[dow] ?? "common.weekday.short.0");
    const dd = lastRec.serviceDate.slice(8, 10);
    const mm = lastRec.serviceDate.slice(5, 7);
    const date = `${dd}/${mm}`;

    const roundedDev = Math.round(lastRec.deviation);
    let delta: string;
    if (roundedDev > 0) {
      delta = t("why.delta.late", { n: roundedDev });
    } else if (roundedDev < 0) {
      delta = t("why.delta.early", { n: Math.abs(roundedDev) });
    } else {
      delta = t("why.delta.on_time");
    }

    if (level !== "trip") {
      const lastTrip = data.trips.find((t) => t.id === lastRec.tripId);
      const lastTripStart = lastTrip ? baseTimeAt(lastTrip, lastTrip.firstPosition) : null;
      const otherTripTime = lastTripStart ? clockText(displayCenter(lastTripStart.minute)) : "";
      delta += t("why.last.other_trip", { time: otherTripTime });
    }

    const lastDetail = t("why.last.detail", { weekday, date, delta });
    const lastA11y = t("why.row.a11y", {
      label: lastLabel,
      value: lastValue,
      detail: lastDetail,
    });
    lastRow = {
      label: lastLabel,
      value: lastValue,
      detail: lastDetail,
      a11y: lastA11y,
    };
  }

  const footnote = t("why.footnote");

  return {
    title,
    context,
    line,
    table: {
      label: tableLabel,
      value: tableValue,
      detail: tableDetail,
      a11y: tableA11y,
    },
    typical: {
      label: typicalLabel,
      value: typicalValue,
      detail: typicalDetail,
      range: typicalRange,
      confidence: typicalConfidence,
      a11y: typicalA11y,
    },
    count: {
      label: countLabel,
      value: countValue,
      detail: countDetail,
      count,
      level,
      levelText,
      nextText,
      a11y: countA11y,
    },
    last: lastRow,
    footnote,
  };
}
