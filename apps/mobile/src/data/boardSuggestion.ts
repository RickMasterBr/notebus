/**
 * Folha Registrar com a posição (E-07 §3.3, D-108). Puro: o "agora" e a posição chegam como argumento.
 *
 * Ordem do ponto sugerido: (a) pela posição (`suggestStop` do domínio, que já filtra idade e precisão); (b) o ponto da
 * rotina (`suggestStop` do app); (c) o último ponto usado; (d) `null` ("Cadastrar um ponto").
 * A sugestão é decidida **uma vez**, na abertura da folha (`createFreezer`), e nunca troca com a folha aberta.
 */
import { type PositionFix, serviceDaysAt, suggestStop as suggestStopByFix } from "@notebus/domain";
import { SUGGEST_WINDOW_MINUTES } from "./boardChoices";
import type { ObservationRow } from "./registro";
import type { ScheduleSnapshot } from "./schedule";

export interface SuggestedStop {
  stopId: string;
  source: "gps" | "routine";
}

export function chooseSuggestedStop(input: {
  fix: PositionFix | null;
  nowMs: number;
  located: readonly { id: string; lat: number | null; lon: number | null }[];
  /** O ponto pela rotina que o app já calcula (`suggestStop` do app). */
  routineStopId: string | null;
  lastUsedStopId: string | null;
  routineRank: ReadonlyMap<string, number>;
}): SuggestedStop | null {
  const byFix = suggestStopByFix(input.fix, input.nowMs, input.located, input.routineRank);
  if (byFix) return { stopId: byFix.stopId, source: "gps" };
  const stopId = input.routineStopId ?? input.lastUsedStopId;
  return stopId ? { stopId, source: "routine" } : null;
}

type Visit = Pick<ObservationRow, "stopId" | "observedAt" | "kind">;

/**
 * A pontuação da rotina por ponto: o mesmo tally de `suggestStop` do app (embarques e "vi passar", mesmo tipo de dia,
 * janela de ±`SUGGEST_WINDOW_MINUTES`). Serve de desempate entre dois pontos frente a frente.
 */
export function routineRank(observations: readonly Visit[], instant: number, data: Pick<ScheduleSnapshot, "calendar">): Map<string, number> {
  const today = serviceDaysAt(instant, data.calendar).today;
  const rank = new Map<string, number>();
  for (const o of observations) {
    if (o.kind !== "boarded" && o.kind !== "passed") continue;
    const day = serviceDaysAt(o.observedAt, data.calendar).today;
    if (day.dayType.dayType !== today.dayType.dayType) continue;
    if (Math.abs(day.minute - today.minute) > SUGGEST_WINDOW_MINUTES) continue;
    rank.set(o.stopId, (rank.get(o.stopId) ?? 0) + 1);
  }
  return rank;
}

/**
 * Congela a primeira decisão: com `ready` falso devolve `undefined` (os dados ainda não chegaram); na primeira vez com
 * `ready` verdadeiro calcula e guarda; depois devolve sempre o guardado, mesmo com outra posição.
 */
export function createFreezer<T>(): (ready: boolean, compute: () => T) => T | undefined {
  let frozen: { value: T } | null = null;
  return (ready, compute) => {
    if (frozen) return frozen.value;
    if (!ready) return undefined;
    frozen = { value: compute() };
    return frozen.value;
  };
}
