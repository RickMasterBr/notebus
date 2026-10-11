/**
 * Regras puras de criar e apagar ponto (E-08 §5.4, bloco 7, Item 3): o rascunho do ponto novo e o texto da recusa.
 * Puro: sem React e sem banco.
 */
import type { StopUsage } from "../db/stopDelete";
import type { StopEditValues } from "../db/stopEdit";
import type { MessageKey } from "../i18n/pt-BR";

export type DeleteRefusal = "not_found" | "official" | "in_use";

export interface RefusalText {
  key: MessageKey;
  params?: { n: number };
}

export const newStopDraft = (): StopEditValues => ({ name: "", aliases: [], externalId: null, note: null });

type UsageKind = "records" | "walks" | "options" | "lines";

/** O primeiro uso que não é zero, na ordem em que a pessoa o apaga: registros, tempos a pé, trajetos, linhas. */
const firstUsage = (usage: StopUsage): { kind: UsageKind; n: number } | null => {
  if (usage.observations > 0) return { kind: "records", n: usage.observations };
  if (usage.walkTimes > 0) return { kind: "walks", n: usage.walkTimes };
  if (usage.options > 0) return { kind: "options", n: usage.options };
  if (usage.patternStops > 0) return { kind: "lines", n: usage.patternStops };
  return null;
};

const IN_USE: Record<UsageKind, { one: MessageKey; other: MessageKey }> = {
  records: { one: "stop_delete.in_use_records_one", other: "stop_delete.in_use_records_other" },
  walks: { one: "stop_delete.in_use_walks_one", other: "stop_delete.in_use_walks_other" },
  options: { one: "stop_delete.in_use_options_one", other: "stop_delete.in_use_options_other" },
  lines: { one: "stop_delete.in_use_lines_one", other: "stop_delete.in_use_lines_other" },
};

export function deleteRefusalText(reason: DeleteRefusal, usage?: StopUsage): RefusalText {
  if (reason === "official") return { key: "stop_delete.official" };
  if (reason === "not_found") return { key: "stop_delete.not_found" };
  const first = usage ? firstUsage(usage) : null;
  if (!first) return { key: "stop_delete.error" };
  return first.n === 1 ? { key: IN_USE[first.kind].one } : { key: IN_USE[first.kind].other, params: { n: first.n } };
}
