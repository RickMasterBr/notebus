/**
 * Identificação de opções de ônibus do trajeto não resolvidas pelo horário em vigor (ideia 242, D-376).
 *
 * Uma opção de ônibus ativa que possui embarque e descida gravados torna-se não resolvida quando:
 * (a) o snapshot do horário não possui o pattern_stop do embarque ou da descida;
 * (b) o percurso não está em vigor na data de serviço (patternInForceOn devolve undefined);
 * (c) a posição do embarque ou da descida não se traduz no percurso em vigor (passagePositionIn devolve null).
 *
 * Opção com embarque e descida em percursos diferentes não é contada (erro de cadastro, não de horário novo).
 */
import type { OptionRow } from "./gotoData";
import type { ScheduleSnapshot } from "./schedule";
import { passagePositionIn, patternInForceOn } from "./continuity";

export function unresolvedBusOptionIds(
  options: readonly OptionRow[],
  routeId: string,
  schedule: ScheduleSnapshot,
  serviceDate: string,
): string[] {
  const activeBusOptions = options
    .filter(
      (o) =>
        o.routeId === routeId &&
        o.deletedAt === null &&
        o.kind === "bus" &&
        o.boardPatternStopId !== null &&
        o.alightPatternStopId !== null,
    )
    .sort((a, b) => a.sort - b.sort);

  const unresolved: string[] = [];

  for (const opt of activeBusOptions) {
    const boardPatternStopId = opt.boardPatternStopId!;
    const alightPatternStopId = opt.alightPatternStopId!;

    const boardInfo = schedule.patternStopById.get(boardPatternStopId);
    const alightInfo = schedule.patternStopById.get(alightPatternStopId);

    // (a) schedule.patternStopById não tem o embarque ou a descida
    if (!boardInfo || !alightInfo) {
      unresolved.push(opt.id);
      continue;
    }

    // Opção com embarque e descida de percursos diferentes não é contada (é erro de cadastro, não de horário novo)
    if (boardInfo.patternId !== alightInfo.patternId) {
      continue;
    }

    // (b) patternInForceOn devolve undefined
    const pattern = patternInForceOn(schedule, boardInfo.patternId, serviceDate);
    if (!pattern) {
      unresolved.push(opt.id);
      continue;
    }

    // (c) passagePositionIn do embarque ou da descida, em relação a esse percurso, devolve null
    const boardPosition = passagePositionIn(schedule, boardPatternStopId, pattern);
    const alightPosition = passagePositionIn(schedule, alightPatternStopId, pattern);
    if (boardPosition === null || alightPosition === null) {
      unresolved.push(opt.id);
      continue;
    }
  }

  return unresolved;
}
