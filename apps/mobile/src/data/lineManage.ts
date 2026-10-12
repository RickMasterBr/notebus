/**
 * Regras puras de apagar linha (E-08 §5.4, D-112, bloco 11b, Item 1).
 * Puro: sem React e sem banco.
 */
import type { LineUsage } from "../db/lineUsage";
import type { MessageKey } from "../i18n/pt-BR";

export type DeleteLineRefusal = "not_found" | "official" | "in_use";

export interface LineDeleteRefusalText {
  key: MessageKey;
  params?: { n: number };
}

/**
 * Mapeia o motivo de recusa de exclusão de linha para o texto de catálogo correspondente.
 * Se o motivo for in_use, prioriza registros (observations) e depois trajetos (options),
 * no singular para 1 e plural para mais.
 */
export function lineDeleteRefusalText(
  reason: DeleteLineRefusal,
  usage?: LineUsage,
): LineDeleteRefusalText {
  if (reason === "official") return { key: "line_delete.official" };
  if (reason === "not_found") return { key: "line_delete.not_found" };

  if (usage) {
    if (usage.observations > 0) {
      return usage.observations === 1
        ? { key: "line_delete.in_use_records_one" }
        : { key: "line_delete.in_use_records_other", params: { n: usage.observations } };
    }
    if (usage.options > 0) {
      return usage.options === 1
        ? { key: "line_delete.in_use_options_one" }
        : { key: "line_delete.in_use_options_other", params: { n: usage.options } };
    }
  }

  return { key: "line_delete.error" };
}
