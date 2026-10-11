/**
 * O que a folha "Declarar horário" (TL-07) mostra e consome, por campo (E-08 §4, D-121). Puro: recebe os horários em
 * memória e o rascunho da folha; as contas são do domínio (`planDeclaration`, `passageChoices`), aqui só o que aparece.
 */
import {
  DECLARE_NIGHT_CUTOFF_MINUTES,
  type DayTypeCode,
  type DeclareStep,
  type DeclareTrip,
  type PassageChoice,
  declaredServiceMinute,
  passageChoices,
  planDeclaration,
} from "@notebus/domain";
import { t } from "../i18n";
import type { MessageKey } from "../i18n";
import type { ScheduleSnapshot } from "./schedule";
import { clockText } from "./stopCard";

/** O que a pessoa já preencheu. `hour` é a hora de relógio (00:00 a 23:59); `null` até ela escolher. */
export interface DeclareDraft {
  lineCode: string | null;
  hour: { hour: number; minute: number } | null;
  /** `passageKey` da passagem escolhida; `null` até escolher. */
  passage: string | null;
  dayTypes: readonly DayTypeCode[];
}

export interface DeclareLine {
  code: string;
  color: string;
}

export interface PassageOption {
  key: string;
  label: string;
  patternId: string;
  position: number;
}

/** O que a gravação recebe (`declare` de `db/declaredTimes.ts`). */
export interface DeclarePlanInput {
  stopId: string;
  serviceMinute: number;
  steps: DeclareStep[];
}

export interface DeclareView {
  /** As linhas que servem o ponto, em ordem de número. */
  lines: DeclareLine[];
  /** A linha escolhida (a única, quando o ponto só tem uma). */
  lineCode: string | null;
  /** O campo "Passagem" só aparece quando a linha passa 2 ou mais vezes no ponto (D-121). */
  showPassage: boolean;
  passageOptions: PassageOption[];
  /** "Madrugada vale como o fim do dia anterior." */
  showNightHint: boolean;
  /** "Este horário vale só neste ponto." (o plano cria viagem nova) */
  showPartialHint: boolean;
  canSave: boolean;
  /** O plano ao vivo; é o que o Salvar entrega à gravação. `null` enquanto faltar campo. */
  plan: DeclarePlanInput | null;
  /** O texto do toast que o plano produziria. */
  toast: string | null;
}

export const passageKey = (patternId: string, position: number) => `${patternId}:${position}`;

const dayName = (day: DayTypeCode) => t(`settings.day.${day}` as MessageKey).toLowerCase();

const joinDays = (days: readonly DayTypeCode[]): string => {
  const names = days.map(dayName);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
};

/** O texto do toast do plano (E-08 §4.1): o que aconteceu, e "Vale também para…" quando a viagem serve a outros dias. */
export function declareToast(steps: readonly DeclareStep[]): string {
  const updates = steps.filter((s) => s.action === "update");
  const creates = steps.filter((s) => s.action === "create_partial");
  let text: string;
  if (updates.length > 0 && creates.length > 0) {
    text = t("declare.toast.updated_created", {
      updated: joinDays(updates.map((s) => s.dayType)),
      created: joinDays(creates.map((s) => s.dayType)),
    });
  } else {
    const replaced = updates.flatMap((s) => (s.action === "update" && s.replaces ? [s.replaces] : []))[0];
    text = !replaced
      ? t("declare.toast.simple")
      : replaced.origin === "official"
        ? t("declare.toast.replaces_official", { time: clockText(replaced.serviceMinute) })
        : t("declare.toast.replaces_declared", { time: clockText(replaced.serviceMinute) });
  }
  const also: DayTypeCode[] = [];
  for (const s of updates) if (s.action === "update") for (const d of s.alsoAffects) if (!also.includes(d)) also.push(d);
  return also.length === 0 ? text : `${text}. ${t("declare.toast.also", { days: joinDays(also) })}`;
}

/** As linhas que servem o ponto e os percursos de cada uma. */
function linesAtStop(stopId: string, data: ScheduleSnapshot) {
  const byLine = new Map<string, { color: string; patternIds: string[] }>();
  for (const p of data.patterns) {
    if (!p.stops.some((s) => s.stopId === stopId)) continue;
    const info = data.patternLine.get(p.id);
    if (!info) continue;
    const entry = byLine.get(info.code) ?? { color: info.color, patternIds: [] };
    entry.patternIds.push(p.id);
    byLine.set(info.code, entry);
  }
  return [...byLine.entries()].sort(([a], [b]) => a.localeCompare(b, "pt", { numeric: true }));
}

/** O rótulo de cada passagem: "1ª"/"2ª" quando o percurso repete o ponto; o percurso quando são percursos diferentes; os dois juntos nos dois casos. */
function optionsOf(choices: readonly PassageChoice[], data: ScheduleSnapshot): PassageOption[] {
  const manyPatterns = new Set(choices.map((c) => c.patternId)).size > 1;
  const direction = (patternId: string): string | null => {
    const stops = data.patterns.find((p) => p.id === patternId)?.stops ?? [];
    const last = stops.reduce<(typeof stops)[number] | null>((a, s) => (a === null || s.position > a.position ? s : a), null);
    const name = last ? data.stopNames.get(last.stopId) : undefined;
    return name === undefined ? null : t("sheet_stop.line_direction", { destination: name });
  };
  const options = choices.map((c, i): PassageOption => {
    const parts = [
      ...(manyPatterns ? [direction(c.patternId)] : []),
      ...(c.number !== null ? [t("declare.passage.nth", { n: c.number })] : []),
    ].filter((p): p is string => p !== null);
    return { key: passageKey(c.patternId, c.position), label: parts.join(" · ") || t("declare.passage.nth", { n: i + 1 }), patternId: c.patternId, position: c.position };
  });
  // Dois percursos com o mesmo destino e uma passagem cada ficariam com o mesmo rótulo: a posição desempata.
  const labels = options.map((o) => o.label);
  return options.map((o) => (labels.filter((l) => l === o.label).length > 1 ? { ...o, label: `${o.label} · ${t("declare.passage.position", { n: o.position })}` } : o));
}

export function buildDeclareView(stopId: string, data: ScheduleSnapshot, draft: DeclareDraft): DeclareView {
  const found = linesAtStop(stopId, data);
  const lines = found.map(([code, { color }]) => ({ code, color }));
  const lineCode = found.length === 1 ? found[0]![0] : found.some(([code]) => code === draft.lineCode) ? draft.lineCode : null;
  const line = found.find(([code]) => code === lineCode)?.[1] ?? null;

  const patterns = line ? data.patterns.filter((p) => line.patternIds.includes(p.id)) : [];
  const choices = passageChoices(patterns, stopId);
  const showPassage = choices.length >= 2;
  const passageOptions = showPassage ? optionsOf(choices, data) : [];
  const chosen = showPassage ? passageOptions.find((o) => o.key === draft.passage) : undefined;

  const showNightHint = draft.hour !== null && draft.hour.hour * 60 + draft.hour.minute < DECLARE_NIGHT_CUTOFF_MINUTES;

  let plan: DeclarePlanInput | null = null;
  if (line && draft.hour !== null && draft.dayTypes.length > 0 && (!showPassage || chosen)) {
    const dayTypesByTrip = new Map(data.schedule.trips.map((trip) => [trip.id, trip.dayTypes]));
    const trips: DeclareTrip[] = data.trips
      .filter((trip) => line.patternIds.includes(trip.patternId))
      .map((trip) => ({ ...trip, dayTypes: dayTypesByTrip.get(trip.id) ?? [] }));
    const serviceMinute = declaredServiceMinute(draft.hour.hour, draft.hour.minute);
    const result = planDeclaration({
      patterns,
      trips,
      stopId,
      serviceMinute,
      dayTypes: draft.dayTypes,
      ...(chosen ? { choice: { patternId: chosen.patternId, position: chosen.position } } : {}),
    });
    if (result.ok) plan = { stopId, serviceMinute, steps: result.steps };
  }

  return {
    lines,
    lineCode,
    showPassage,
    passageOptions,
    showNightHint,
    showPartialHint: plan !== null && plan.steps.some((s) => s.action === "create_partial"),
    canSave: plan !== null,
    plan,
    toast: plan ? declareToast(plan.steps) : null,
  };
}
