/**
 * Fato da prévia do Registrar (D-061, B-01): o mesmo `kind` e `mode` que a gravação usará (`registro.ts`, `modeFor`),
 * para a frase ao vivo e a dedução gravada darem o mesmo resultado.
 */
import { type ObservationFact, modeFor } from "@notebus/domain";
import { type RecordDraft, draftInterval } from "./recordDraft";
import type { ObservationRow } from "./registro";

export function recordPreviewFact(
  draft: RecordDraft,
  initialRow: Pick<ObservationRow, "stopId" | "lineId" | "recordedAt">,
): Pick<ObservationFact, "stopId" | "lineId" | "observedAt" | "observedEndAt" | "kind" | "mode"> {
  const { observedAt, observedEndAt } = draftInterval(draft);
  return {
    stopId: initialRow.stopId,
    lineId: initialRow.lineId,
    observedAt,
    observedEndAt,
    kind: draft.kind,
    mode: modeFor({ memory: draft.memory, observedAt, recordedAt: initialRow.recordedAt }),
  };
}
