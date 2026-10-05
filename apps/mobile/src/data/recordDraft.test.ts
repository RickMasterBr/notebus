import { describe, expect, it } from "vitest";
import { lisbonWallClock, type MatchPreview } from "@notebus/domain";
import type { ObservationRow } from "./registro";
import {
  applyDelta,
  applyPickedTime,
  applyPrecision,
  applySpread,
  draftInterval,
  formatDraftTime,
  formatMatchPreview,
  initDraft,
  isPlusOneDisabled,
  toPatch,
  validateDraft,
} from "./recordDraft";
import { t } from "../i18n";

describe("recordDraft", () => {
  // Quinta-feira 2026-10-01 às 08:13:20 em Lisboa (UTC+1: 07:13:20 UTC)
  // 2026-10-01T07:13:20.000Z
  const t0813 = new Date("2026-10-01T07:13:20.000Z").getTime();
  const now = new Date("2026-10-01T07:13:30.000Z").getTime();

  const baseRow: ObservationRow = {
    id: "obs-1",
    rideId: "ride-1",
    stopId: "stop-arrabalde",
    lineId: "line-1",
    observedAt: t0813,
    observedEndAt: null,
    kind: "boarded",
    mode: "live",
    recordedAt: t0813,
    note: null,
    deletedAt: null,
    serviceDate: "2026-10-01",
    serviceMinute: 493,
    patternStopId: "ps-1",
    tripId: "trip-1",
    matchStatus: "auto",
    deviationMin: 1,
    matchRuleVersion: 1,
    reviewDismissedAt: null,
    source: "user",
    gpsLat: null,
    gpsLon: null,
    gpsAccuracyM: null,
    createdAt: t0813,
    updatedAt: t0813,
  };

  it("initDraft inicializa corretamente modo exata", () => {
    const draft = initDraft(baseRow);
    expect(draft.centerMs).toBe(t0813);
    expect(draft.precision).toBe("exact");
    expect(draft.spreadMinutes).toBe(5);
    expect(draft.kind).toBe("boarded");
    expect(draft.memory).toBe(false);
    expect(draft.note).toBe("");
  });

  it("initDraft inicializa intervalo quando observedEndAt existe", () => {
    const rowWithRange: ObservationRow = {
      ...baseRow,
      observedAt: t0813 - 2 * 60_000,
      observedEndAt: t0813 + 2 * 60_000,
    };
    const draft = initDraft(rowWithRange);
    expect(draft.precision).toBe("range");
    expect(draft.spreadMinutes).toBe(2);
    expect(draft.centerMs).toBe(t0813);
  });

  it("applyDelta move o centro em minutos e preserva segundos", () => {
    const draft = initDraft(baseRow);
    // −5 min: 08:13:20 → 08:08:20
    const minus5 = applyDelta(draft, -5, now);
    expect(minus5.centerMs).toBe(t0813 - 5 * 60_000);
    expect(lisbonWallClock(minus5.centerMs).minute).toBe(8 * 60 + 8);
    expect(minus5.centerMs % 60_000).toBe(t0813 % 60_000);

    // −10, −2, −1
    expect(applyDelta(draft, -10, now).centerMs).toBe(t0813 - 10 * 60_000);
    expect(applyDelta(draft, -2, now).centerMs).toBe(t0813 - 2 * 60_000);
    expect(applyDelta(draft, -1, now).centerMs).toBe(t0813 - 1 * 60_000);
  });

  it("limite do futuro: +1 fica desabilitado quando próximo minuto passaria de agora", () => {
    const draft = initDraft(baseRow); // 08:13:20, now é 08:13:30
    // +1 min seria 08:14:20 > now (08:13:30)
    expect(isPlusOneDisabled(draft, now)).toBe(true);
    const unchanged = applyDelta(draft, 1, now);
    expect(unchanged.centerMs).toBe(draft.centerMs);

    // Se retrocedermos para 08:08:20, +1 fica habilitado
    const minus5 = applyDelta(draft, -5, now);
    expect(isPlusOneDisabled(minus5, now)).toBe(false);
    const plus1 = applyDelta(minus5, 1, now);
    expect(plus1.centerMs).toBe(minus5.centerMs + 60_000);
  });

  it("applyPrecision e applySpread configuram intervalo 'mais ou menos'", () => {
    const draft = initDraft(baseRow);
    const rangeDraft = applyPrecision(draft, "range");
    expect(rangeDraft.precision).toBe("range");
    expect(draftInterval(rangeDraft)).toEqual({
      observedAt: t0813 - 5 * 60_000,
      observedEndAt: t0813 + 5 * 60_000,
    });

    const spread2 = applySpread(draft, 2);
    expect(spread2.precision).toBe("range");
    expect(spread2.spreadMinutes).toBe(2);
    expect(draftInterval(spread2)).toEqual({
      observedAt: t0813 - 2 * 60_000,
      observedEndAt: t0813 + 2 * 60_000,
    });

    const spread10 = applySpread(draft, 10);
    expect(spread10.spreadMinutes).toBe(10);
    expect(draftInterval(spread10)).toEqual({
      observedAt: t0813 - 10 * 60_000,
      observedEndAt: t0813 + 10 * 60_000,
    });
  });

  it("applyPickedTime resolve para hora mais recente no passado e preserva segundos", () => {
    const draft = initDraft(baseRow);
    // Escolhe 08:00
    const picked = applyPickedTime(draft, 8, 0, now);
    const wall = lisbonWallClock(picked.centerMs);
    expect(wall.minute).toBe(8 * 60);
    expect(picked.centerMs % 60_000).toBe(t0813 % 60_000);
  });

  it("toPatch devolve só o que mudou; sem mudanças devolve patch vazio", () => {
    const draft = initDraft(baseRow);
    expect(toPatch(draft, baseRow)).toEqual({});

    // Muda só a hora
    const minus5 = applyDelta(draft, -5, now);
    expect(toPatch(minus5, baseRow)).toEqual({
      observedAt: minus5.centerMs,
    });

    // Muda modo para range ±2
    const range2 = applySpread(draft, 2);
    expect(toPatch(range2, baseRow)).toEqual({
      observedAt: t0813 - 2 * 60_000,
      observedEndAt: t0813 + 2 * 60_000,
    });

    // Muda tipo
    const passed = { ...draft, kind: "passed" as const };
    expect(toPatch(passed, baseRow)).toEqual({ kind: "passed" });

    // Muda memória
    const memory = { ...draft, memory: true };
    expect(toPatch(memory, baseRow)).toEqual({ memory: true });

    // Muda nota
    const withNote = { ...draft, note: "ônibus cheio" };
    expect(toPatch(withNote, baseRow)).toEqual({ note: "ônibus cheio" });

    // Nota em branco vira null se antes era texto
    const rowWithNote = { ...baseRow, note: "antiga" };
    const clearedNote = { ...initDraft(rowWithNote), note: "   " };
    expect(toPatch(clearedNote, rowWithNote)).toEqual({ note: null });
  });

  it("formatDraftTime formata exata e range", () => {
    const draft = initDraft(baseRow);
    expect(formatDraftTime(draft)).toBe("08:13");

    const range = applySpread(draft, 5);
    // 08:13 ± 5 min -> 08:08–08:18
    expect(formatDraftTime(range)).toBe("08:08–08:18");
  });

  it("formatMatchPreview formata auto, orphan e ambiguous", () => {
    const draft = initDraft(baseRow);
    // Auto: viagem das 08:10, passa às 08:12, +1
    const autoPreview = {
      status: "auto" as const,
      chosen: {
        tripId: "t-1",
        patternId: "p-1",
        position: 2,
        serviceDate: "2026-10-01",
        base: { minute: 8 * 60 + 12, interpolated: false },
        deviation: 1,
        distance: 1 / 15,
      },
      departureMinute: 8 * 60 + 10,
      nearest: null,
      candidates: [],
    };
    const autoResult = formatMatchPreview(autoPreview as unknown as MatchPreview, draft, "1");
    expect(autoResult.kind).toBe("auto");
    expect(autoResult.text).toBe(
      "Casa com a viagem das 08:10 · pela tabela passa aqui às 08:12 · você: 1 min depois",
    );

    // Auto com desvio negativo (−4)
    const earlyPreview = {
      ...autoPreview,
      chosen: { ...autoPreview.chosen, deviation: -4 },
    };
    const earlyResult = formatMatchPreview(earlyPreview as unknown as MatchPreview, draft, "1");
    expect(earlyResult.text).toBe(
      "Casa com a viagem das 08:10 · pela tabela passa aqui às 08:12 · você: 4 min antes",
    );

    // Orphan exato
    const orphanPreview = {
      status: "orphan" as const,
      chosen: null,
      departureMinute: null,
      nearest: null,
      candidates: [],
    };
    const orphanResult = formatMatchPreview(orphanPreview as unknown as MatchPreview, draft, "1");
    expect(orphanResult.kind).toBe("orphan");
    expect(orphanResult.text).toBe(
      "Nenhuma viagem da linha 1 costuma passar aqui às 08:13. Vai ficar para conferir, fora da estimativa.",
    );

    // Ambígua
    const ambiguousPreview = {
      status: "ambiguous" as const,
      chosen: null,
      departureMinute: null,
      nearest: null,
      candidates: [],
    };
    const ambiguousResult = formatMatchPreview(ambiguousPreview as unknown as MatchPreview, draft, "1");
    expect(ambiguousResult.kind).toBe("ambiguous");
    expect(ambiguousResult.text).toBe(
      "Duas viagens podem ter sido essa. Vai ficar para conferir.",
    );
  });

  it("T-33: valores à mão do p48 (08:13, 08:11, 08:08, 08:03)", () => {
    // Linha 1, Arrabalde (pos. 2): viagem das 08:10 sai às 08:10 (490) e passa na Arrabalde às 08:12 (492)
    const baseCandidate = {
      tripId: "t-0810",
      patternId: "p-1",
      position: 2,
      serviceDate: "2026-10-01",
      base: { minute: 492, interpolated: false },
      distance: 0,
    };

    // 08:13: 493 − 492 = +1
    const p0813 = {
      status: "auto" as const,
      chosen: { ...baseCandidate, deviation: 1 },
      departureMinute: 490,
      nearest: null,
      candidates: [],
    };
    const d0813 = { ...initDraft(baseRow), centerMs: new Date("2026-10-01T07:13:00.000Z").getTime() };
    expect(formatMatchPreview(p0813 as unknown as MatchPreview, d0813, "1").text).toBe(
      "Casa com a viagem das 08:10 · pela tabela passa aqui às 08:12 · você: 1 min depois",
    );

    // 08:11: 491 − 492 = −1
    const p0811 = {
      status: "auto" as const,
      chosen: { ...baseCandidate, deviation: -1 },
      departureMinute: 490,
      nearest: null,
      candidates: [],
    };
    const d0811 = { ...initDraft(baseRow), centerMs: new Date("2026-10-01T07:11:00.000Z").getTime() };
    expect(formatMatchPreview(p0811 as unknown as MatchPreview, d0811, "1").text).toBe(
      "Casa com a viagem das 08:10 · pela tabela passa aqui às 08:12 · você: 1 min antes",
    );

    // 08:08: 488 − 492 = −4
    const p0808 = {
      status: "auto" as const,
      chosen: { ...baseCandidate, deviation: -4 },
      departureMinute: 490,
      nearest: null,
      candidates: [],
    };
    const d0808 = { ...initDraft(baseRow), centerMs: new Date("2026-10-01T07:08:00.000Z").getTime() };
    expect(formatMatchPreview(p0808 as unknown as MatchPreview, d0808, "1").text).toBe(
      "Casa com a viagem das 08:10 · pela tabela passa aqui às 08:12 · você: 4 min antes",
    );

    // 08:03: 483 − 492 = −9 (órfã, desvio além de -5)
    const p0803 = {
      status: "orphan" as const,
      chosen: null,
      departureMinute: null,
      nearest: { ...baseCandidate, deviation: -9 },
      candidates: [],
    };
    const d0803 = { ...initDraft(baseRow), centerMs: new Date("2026-10-01T07:03:00.000Z").getTime() };
    expect(formatMatchPreview(p0803 as unknown as MatchPreview, d0803, "1").text).toBe(
      "Nenhuma viagem da linha 1 costuma passar aqui às 08:03. Vai ficar para conferir, fora da estimativa.",
    );
  });

  it("validateDraft detecta descida antes do embarque, futuro e aviso de vi passar", () => {
    const draft = initDraft(baseRow);

    // Futuro
    const futureDraft = { ...draft, centerMs: now + 5 * 60_000 };
    expect(validateDraft(futureDraft, baseRow, { now })).toBe(t("sheet_record.problem.future"));

    // Embarque com descida: mudar para "vi passar" emite o aviso
    const alightRow: ObservationRow = {
      ...baseRow,
      id: "obs-alight-1",
      kind: "alighted",
      observedAt: t0813 + 15 * 60_000,
    };
    const passedDraft = { ...draft, kind: "passed" as const };
    expect(validateDraft(passedDraft, baseRow, { now, alightRow })).toBe(
      t("sheet_record.kind_passed_warning"),
    );

    // Embarque com descida: adiantar o embarque para DEPOIS da descida
    const lateBoarding = { ...draft, centerMs: alightRow.observedAt + 60_000 };
    expect(validateDraft(lateBoarding, baseRow, { now: alightRow.observedAt + 120_000, alightRow })).toBe(
      t("sheet_record.problem.before_boarding"),
    );

    // Descida antes do embarque
    const alightDraft = initDraft(alightRow);
    const earlyAlight = { ...alightDraft, centerMs: baseRow.observedAt - 60_000 };
    expect(validateDraft(earlyAlight, alightRow, { now, boardingRow: baseRow })).toBe(
      t("sheet_record.problem.before_boarding"),
    );
  });
});
