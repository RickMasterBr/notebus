import { describe, expect, it } from "vitest";
import type { ObservationRow } from "./registro";
import { initDraft } from "./recordDraft";
import { recordPreviewFact } from "./recordPreviewFact";

// O fato da prévia do Registrar tem de ter o kind e o mode que a gravação usará (registro.ts: modeFor), para a frase
// ao vivo e a dedução gravada darem o mesmo resultado (B-01). Dados inventados (D-091).
const at = new Date("2026-10-01T07:37:20.000Z").getTime();
const row = (over: Partial<ObservationRow> = {}): ObservationRow => ({
  id: "obs-1",
  rideId: "ride-1",
  stopId: "stop-estadio",
  lineId: "line-1",
  observedAt: at,
  observedEndAt: null,
  kind: "boarded",
  mode: "live",
  recordedAt: at,
  note: null,
  deletedAt: null,
  serviceDate: "2026-10-01",
  serviceMinute: 457,
  patternStopId: "ps-1",
  tripId: null,
  ...over,
} as ObservationRow);

describe("recordPreviewFact", () => {
  it("embarque ao vivo: kind boarded, mode live, ponto e linha da linha original", () => {
    const r = row();
    expect(recordPreviewFact(initDraft(r), r)).toEqual({
      stopId: "stop-estadio",
      lineId: "line-1",
      observedAt: at,
      observedEndAt: null,
      kind: "boarded",
      mode: "live",
    });
  });

  it("hora mexida no seletor: mode later; intervalo \"mais ou menos\" sai no fato", () => {
    const r = row();
    const d = { ...initDraft(r), centerMs: at - 5 * 60_000 };
    expect(recordPreviewFact(d, r)).toMatchObject({ mode: "later", observedAt: at - 5 * 60_000, observedEndAt: null });
    const range = recordPreviewFact({ ...initDraft(r), precision: "range" as const, spreadMinutes: 5 as const }, r);
    expect(range.observedEndAt).not.toBeNull();
  });

  it("de memória: mode memory, mesmo com a hora igual à do toque", () => {
    const r = row();
    expect(recordPreviewFact({ ...initDraft(r), memory: true }, r).mode).toBe("memory");
    const m = row({ mode: "memory" });
    expect(recordPreviewFact(initDraft(m), m).mode).toBe("memory");
  });

  it("descida: kind alighted vem do rascunho", () => {
    const r = row({ kind: "alighted" });
    expect(recordPreviewFact(initDraft(r), r)).toMatchObject({ kind: "alighted", mode: "live" });
  });
});
