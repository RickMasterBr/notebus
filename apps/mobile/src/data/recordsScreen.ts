/**
 * O modelo da tela Registros por semana (D-396, D-414). Puro: sem React, sem banco, sem relógio (o instante vem de
 * quem chama).
 *
 * - `unansweredNoAlight`: as viagens fechadas sem descida cujo embarque casou e que ainda pedem "Onde você desceu?".
 * - `buildRecordsScreen`: "Agora", "Para conferir" (as duas filas juntas, do mais novo ao mais antigo), a semana de hoje
 *   e as semanas anteriores recolhidas, e as linhas para o filtro. Reaproveita `buildTripsList` (E-08.5) para os itens.
 */
import { addDays, dayOfWeek, lisbonWallClock } from "@notebus/domain";
import type { ObservationRow, RideRow } from "./registro";
import {
  buildTripsList,
  createTripCardModel,
  type TripCardModel,
  type TripDayGroup,
  type TripListItem,
} from "./recordsTrips";
import { serviceDateOfRow, type RecordListRow, type RecordsSnapshotDeps } from "./recordsList";

/** Uma semana da lista: o início (segunda-feira), as contagens e os dias só quando o usuário a abriu. */
export interface WeekSummary {
  weekStart: string;
  tripCount: number;
  pendingCount: number;
  days: TripDayGroup[] | null;
}

/** Item da fila "Para conferir": um registro que precisa de escolha, ou a viagem que pede "Onde você desceu?". */
export type RecordsPendingItem =
  | { kind: "review"; row: RecordListRow }
  | { kind: "noAlight"; card: TripCardModel };

export interface RecordsScreenModel {
  now: TripCardModel | null;
  pending: RecordsPendingItem[];
  pendingTotal: number;
  /** Os 3 primeiros de `pending`. */
  pendingPreview: RecordsPendingItem[];
  /** `boardingId` das viagens de `unansweredNoAlight`, para o cartão do dia mostrar "Onde você desceu?". */
  noAlightIds: ReadonlySet<string>;
  thisWeek: TripDayGroup[];
  /** Da mais nova para a mais antiga. */
  olderWeeks: WeekSummary[];
  lines: { code: string; color: string }[];
}

/** O início (segunda) da semana de uma data de serviço. `dayOfWeek`: 0 = domingo … 6 = sábado. */
function weekStartOf(date: string): string {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

/** Número de dias de `from` (mais antigo) a `to`, inclusivo. As duas são datas de serviço ("AAAA-MM-DD"). */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Os embarques vivos, casados (auto ou manual), cuja viagem está fechada, viva e sem descida, e que ainda não foram
 * dispensados com "Deixar para conferir" (`review_dismissed_at`). Do mais novo ao mais antigo. Devolve os `boardingId`.
 */
export function unansweredNoAlight(
  observations: readonly ObservationRow[],
  rides: readonly RideRow[],
): string[] {
  const obsById = new Map<string, ObservationRow>();
  for (const o of observations) obsById.set(o.id, o);

  const found: { id: string; observedAt: number }[] = [];
  const seen = new Set<string>();
  for (const r of rides) {
    if (r.deletedAt != null) continue;
    if (r.status !== "closed") continue;
    if (r.alightingObservationId != null) continue;
    const boarding = obsById.get(r.boardingObservationId);
    if (!boarding) continue;
    if (boarding.deletedAt != null) continue;
    if (boarding.kind !== "boarded") continue;
    if (boarding.matchStatus !== "auto" && boarding.matchStatus !== "manual") continue;
    if (boarding.reviewDismissedAt != null) continue;
    if (seen.has(boarding.id)) continue;
    seen.add(boarding.id);
    found.push({ id: boarding.id, observedAt: boarding.observedAt });
  }
  found.sort((a, b) => b.observedAt - a.observedAt);
  return found.map((f) => f.id);
}

const observedAtOf = (item: RecordsPendingItem, live: Map<string, ObservationRow>): number =>
  item.kind === "review" ? item.row.observedAt : (live.get(item.card.boardingId)?.observedAt ?? 0);

const lineOf = (item: TripListItem): { code: string; color: string } =>
  item.kind === "trip" ? item.line : item.row.line;

/** Códigos numéricos primeiro (ordem numérica), depois os não numéricos por ordem alfabética. */
function compareLineCodes(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : null;
  const nb = /^\d+$/.test(b) ? Number(b) : null;
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a.localeCompare(b);
}

function collectLines(weekDays: Map<string, TripDayGroup[]>): { code: string; color: string }[] {
  const colorsByCode = new Map<string, string>();
  for (const days of weekDays.values()) {
    for (const day of days) {
      for (const item of day.items) {
        const line = lineOf(item);
        if (!colorsByCode.has(line.code)) colorsByCode.set(line.code, line.color);
      }
    }
  }
  return [...colorsByCode.entries()]
    .map(([code, color]) => ({ code, color }))
    .sort((a, b) => compareLineCodes(a.code, b.code));
}

/** Tira os itens de outra linha; dia sem item sai. */
function filterDays(days: TripDayGroup[], lineFilter: string | null): TripDayGroup[] {
  if (lineFilter === null) return days;
  const kept: TripDayGroup[] = [];
  for (const day of days) {
    const items = day.items.filter((item) => lineOf(item).code === lineFilter);
    if (items.length > 0) kept.push({ ...day, items });
  }
  return kept;
}

function summarizeWeek(weekStart: string, days: TripDayGroup[], noAlightIds: ReadonlySet<string>): WeekSummary {
  let tripCount = 0;
  let pendingCount = 0;
  for (const day of days) {
    for (const item of day.items) {
      if (item.kind !== "trip") continue;
      tripCount++;
      if (item.verifyState === "pending" || noAlightIds.has(item.boardingId)) pendingCount++;
    }
  }
  return { weekStart, tripCount, pendingCount, days: null };
}

export function buildRecordsScreen(input: {
  observations: readonly ObservationRow[];
  rides: readonly RideRow[];
  snapshot: RecordsSnapshotDeps | null;
  now: number;
  lineFilter: string | null;
  expandedWeeks: ReadonlySet<string>;
}): RecordsScreenModel {
  const live = input.observations.filter((o) => o.deletedAt == null);
  const liveObsMap = new Map<string, ObservationRow>();
  for (const o of live) liveObsMap.set(o.id, o);

  const rideByBoardingId = new Map<string, RideRow>();
  for (const r of input.rides) {
    if (r.deletedAt == null) rideByBoardingId.set(r.boardingObservationId, r);
  }

  const noAlightIds = new Set(unansweredNoAlight(input.observations, input.rides));

  // A janela cobre do registro vivo mais antigo a hoje (mínimo 7 dias): as semanas anteriores entram todas.
  const nowDate = lisbonWallClock(input.now).date;
  let windowDays = 7;
  if (live.length > 0) {
    let oldest = nowDate;
    for (const o of live) {
      const date = serviceDateOfRow(o);
      if (date < oldest) oldest = date;
    }
    windowDays = Math.max(7, daysBetween(oldest, nowDate));
  }

  const list = buildTripsList({
    observations: input.observations,
    rides: input.rides,
    snapshot: input.snapshot,
    now: input.now,
    windowDays,
  });

  // "Para conferir": as duas filas juntas, do mais novo ao mais antigo (por `observedAt`).
  const pending: RecordsPendingItem[] = list.pending.map((row) => ({ kind: "review", row }));
  for (const boardingId of noAlightIds) {
    const boarding = liveObsMap.get(boardingId);
    if (!boarding) continue;
    const ride = rideByBoardingId.get(boardingId);
    pending.push({ kind: "noAlight", card: createTripCardModel(boarding, ride, liveObsMap, input.snapshot, null) });
  }
  pending.sort((a, b) => observedAtOf(b, liveObsMap) - observedAtOf(a, liveObsMap));

  // Os dias por semana, antes do filtro (para `lines` e para a contagem das semanas recolhidas).
  const weekDays = new Map<string, TripDayGroup[]>();
  for (const day of list.days) {
    const weekStart = weekStartOf(day.serviceDate);
    const bucket = weekDays.get(weekStart);
    if (bucket) bucket.push(day);
    else weekDays.set(weekStart, [day]);
  }

  const lines = collectLines(weekDays);

  const thisWeekStart = weekStartOf(nowDate);
  const thisWeek = filterDays(weekDays.get(thisWeekStart) ?? [], input.lineFilter);

  const olderStarts = [...weekDays.keys()]
    .filter((weekStart) => weekStart < thisWeekStart)
    .sort((a, b) => b.localeCompare(a));
  const olderWeeks: WeekSummary[] = [];
  for (const weekStart of olderStarts) {
    const days = filterDays(weekDays.get(weekStart)!, input.lineFilter);
    if (days.length === 0) continue;
    const summary = summarizeWeek(weekStart, days, noAlightIds);
    summary.days = input.expandedWeeks.has(weekStart) ? days : null;
    olderWeeks.push(summary);
  }

  return {
    now: list.now,
    pending,
    pendingTotal: pending.length,
    pendingPreview: pending.slice(0, 3),
    noAlightIds,
    thisWeek,
    olderWeeks,
    lines,
  };
}
