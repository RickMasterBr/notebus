/**
 * Subtítulo "sair às HH:MM · [Lugar]" para o cartão "Perto de você" (E-05 §4.3, Bloco 3 item 3.3, Bloco 3b Item 3).
 *
 * Regra do Bloco 3b (sem lógica de horário própria, usa o mesmo cálculo da TL-04):
 * - Para o ponto do cartão, acha os trajetos ativos com opção de ônibus que embarca nesse ponto físico (mesmo stopId).
 * - Para cada um, usa buildGotoInputFromSources + gotoCards (com o mesmo now) e pega o primeiro cartão de ônibus
 *   cuja opção embarca neste ponto.
 * - Entre os trajetos, vale o que tem origem "Casa"; sem "Casa", o de menor leaveAt.
 * - Texto: home.stop_card.leave_at_neutral com leaveAt e o nome do lugar de origem ("sair às 07:59 · Casa").
 * - Sem trajeto/opção/viagem: o cartão fica sem a linha (null).
 */
import { formatServiceMinute, gotoCards } from "@notebus/domain";
import { t } from "../i18n";
import {
  buildGotoInputFromSources,
  type ObservationRow,
  type OptionRow,
  type RideRow,
  type RouteRow,
  type WalkTimeRow,
} from "./gotoData";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

export interface PlaceRef {
  id: string;
  name: string;
  deletedAt: number | null;
}

export interface StopCardLeaveAtSources {
  stopId: string;
  places: readonly PlaceRef[];
  routes: readonly RouteRow[];
  options: readonly OptionRow[];
  walkTimes: readonly WalkTimeRow[];
  observations?: readonly ObservationRow[];
  rides?: readonly RideRow[];
  schedule: ScheduleSnapshot | null;
  now: number;
}

export function stopCardLeaveAtSubtitle(
  sources: StopCardLeaveAtSources,
): string | null {
  const {
    stopId,
    places,
    routes,
    options,
    walkTimes,
    observations = [],
    rides = [],
    schedule,
    now,
  } = sources;

  if (!schedule) return null;

  // 1. Acha os trajetos ativos com opção de ônibus que embarca nesse ponto físico (mesmo stopId)
  const activeRoutes = routes.filter((r) => r.deletedAt === null);
  const activePlacesMap = new Map<string, PlaceRef>();
  for (const p of places) {
    if (p.deletedAt === null) activePlacesMap.set(p.id, p);
  }

  interface CandidateResult {
    route: RouteRow;
    originPlace: PlaceRef;
    leaveAt: number;
    isCasa: boolean;
  }

  const candidateResults: CandidateResult[] = [];

  for (const r of activeRoutes) {
    const originPlace = activePlacesMap.get(r.originPlaceId);
    if (!originPlace) continue;

    // Confere se o trajeto tem alguma opção ativa de ônibus que embarca neste stopId
    const routeOptions = options.filter(
      (o) => o.routeId === r.id && o.deletedAt === null && o.kind === "bus" && o.boardPatternStopId !== null,
    );
    const hasOptionAtStop = routeOptions.some((o) => {
      const bp = schedule.patternStopById.get(o.boardPatternStopId!);
      return bp?.stopId === stopId;
    });
    if (!hasOptionAtStop) continue;

    // Usa buildGotoInputFromSources + gotoCards (o mesmo caminho da TL-04)
    const gotoInput = buildGotoInputFromSources(
      {
        route: r,
        options,
        walkTimes,
        observations,
        rides,
        schedule,
      },
      now,
    );
    if (!gotoInput) continue;

    const cards = gotoCards(gotoInput);

    // Pega o primeiro cartão de ônibus cuja opção embarca neste ponto
    const firstBus = cards.find((c) => {
      if (c.kind !== "bus") return false;
      const opt = options.find((o) => o.id === c.optionId);
      if (!opt || !opt.boardPatternStopId) return false;
      const bp = schedule.patternStopById.get(opt.boardPatternStopId);
      return bp?.stopId === stopId;
    });

    if (firstBus && firstBus.kind === "bus") {
      const isCasa = originPlace.name.trim().toLowerCase() === "casa";
      candidateResults.push({
        route: r,
        originPlace,
        leaveAt: firstBus.leaveAt,
        isCasa,
      });
    }
  }

  if (candidateResults.length === 0) return null;

  // 2. Entre os trajetos, vale o que tem origem "Casa"; sem "Casa", o de menor leaveAt
  const casaCandidates = candidateResults.filter((c) => c.isCasa);
  let selected: CandidateResult;
  if (casaCandidates.length > 0) {
    casaCandidates.sort((a, b) => a.leaveAt - b.leaveAt);
    selected = casaCandidates[0]!;
  } else {
    candidateResults.sort((a, b) => a.leaveAt - b.leaveAt);
    selected = candidateResults[0]!;
  }

  // 3. Texto: home.stop_card.leave_at_neutral com leaveAt e o nome do lugar de origem
  const time = clockText(selected.leaveAt);
  return t("home.stop_card.leave_at_neutral", { time, place: selected.originPlace.name });
}

