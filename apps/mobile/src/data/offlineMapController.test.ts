import { describe, expect, it, vi } from "vitest";
import {
  applyOfflineSnooze,
  canStartOfflineDownload,
  mapShownForOffer,
  reduceOfflineMap,
  type OfflineControllerState,
} from "./offlineMapController";
import {
  OFFLINE_SNOOZE_MS,
  shouldOfferOfflineMap,
  snoozedUntil,
} from "./mapOfflineState";

describe("offlineMapController (Item 1 puro)", () => {
  const initialState: OfflineControllerState = {
    status: { kind: "none" },
    mapVisible: true,
    snoozedUntilMs: null,
  };

  it("início ignorado durante download", () => {
    // 1. Inicia download a partir de none -> vira downloading percent 0
    const downloadingState = reduceOfflineMap(initialState, {
      type: "download_started",
    });
    expect(downloadingState.status).toEqual({
      kind: "downloading",
      percent: 0,
    });

    // 2. Com progresso em 40%
    const inProgressState = reduceOfflineMap(downloadingState, {
      type: "download_progress",
      percent: 40,
    });
    expect(inProgressState.status).toEqual({
      kind: "downloading",
      percent: 40,
    });

    // 3. Novo download_started durante download é ignorado (mantém 40%)
    const ignoredState = reduceOfflineMap(inProgressState, {
      type: "download_started",
    });
    expect(ignoredState.status).toEqual({
      kind: "downloading",
      percent: 40,
    });
  });

  it("progresso monotônico (nunca volta)", () => {
    const s1 = reduceOfflineMap(initialState, { type: "download_started" });
    const s2 = reduceOfflineMap(s1, {
      type: "download_progress",
      percent: 50,
    });
    expect(s2.status).toEqual({ kind: "downloading", percent: 50 });

    // Evento de progresso menor (ex.: oscilação nativa de 30%) não faz regredir
    const s3 = reduceOfflineMap(s2, {
      type: "download_progress",
      percent: 30,
    });
    expect(s3.status).toEqual({ kind: "downloading", percent: 50 });

    // Evento de progresso maior avança normalmente
    const s4 = reduceOfflineMap(s3, {
      type: "download_progress",
      percent: 75,
    });
    expect(s4.status).toEqual({ kind: "downloading", percent: 75 });
  });

  it("fim vira ready", () => {
    const s1 = reduceOfflineMap(initialState, { type: "download_started" });
    const s2 = reduceOfflineMap(s1, {
      type: "download_completed",
      bytes: 9_542_041,
    });
    expect(s2.status).toEqual({
      kind: "ready",
      bytes: 9_542_041,
    });
  });

  it("erro vira error", () => {
    const s1 = reduceOfflineMap(initialState, { type: "download_started" });
    const s2 = reduceOfflineMap(s1, { type: "download_failed" });
    expect(s2.status).toEqual({ kind: "error" });
  });

  it("soneca grava e some a oferta", () => {
    const nowMs = 1_700_000_000_000;
    // Inicialmente a oferta é visível
    expect(
      shouldOfferOfflineMap({
        status: initialState.status,
        mapVisible: initialState.mapVisible,
        snoozedUntilMs: initialState.snoozedUntilMs,
        nowMs,
      }),
    ).toBe(true);

    const untilMs = snoozedUntil(nowMs);
    const snoozedState = reduceOfflineMap(initialState, {
      type: "snoozed",
      untilMs,
    });
    expect(snoozedState.snoozedUntilMs).toBe(untilMs);

    // Oferta some após a soneca
    expect(
      shouldOfferOfflineMap({
        status: snoozedState.status,
        mapVisible: snoozedState.mapVisible,
        snoozedUntilMs: snoozedState.snoozedUntilMs,
        nowMs,
      }),
    ).toBe(false);
  });

  it("apagar mapa vira none", () => {
    const readyState: OfflineControllerState = {
      status: { kind: "ready", bytes: 9_000_000 },
      mapVisible: true,
      snoozedUntilMs: null,
    };
    const deletedState = reduceOfflineMap(readyState, { type: "map_deleted" });
    expect(deletedState.status).toEqual({ kind: "none" });
  });
});

describe("mapShownForOffer (Item 0.2 puro)", () => {
  it("(false, true) → true; (true, true), (false, false), (true, false) → false", () => {
    expect(mapShownForOffer(false, true)).toBe(true);
    expect(mapShownForOffer(true, true)).toBe(false);
    expect(mapShownForOffer(false, false)).toBe(false);
    expect(mapShownForOffer(true, false)).toBe(false);
  });
});

describe("canStartOfflineDownload (Item 0.3 puro)", () => {
  it("none, ready e error → true; downloading com percent 0 e com percent 40 → false", () => {
    expect(canStartOfflineDownload({ kind: "none" })).toBe(true);
    expect(canStartOfflineDownload({ kind: "ready", bytes: 1000 })).toBe(true);
    expect(canStartOfflineDownload({ kind: "error" })).toBe(true);
    expect(canStartOfflineDownload({ kind: "downloading", percent: 0 })).toBe(false);
    expect(canStartOfflineDownload({ kind: "downloading", percent: 40 })).toBe(false);
  });
});

describe("applyOfflineSnooze (Item 0.5 puro)", () => {
  it("com write espião: write chamado uma vez com (nowMs + OFFLINE_SNOOZE_MS, nowMs), dispatch chamado com until, dispatch antes de write", async () => {
    const nowMs = 1_700_000_000_000;
    const callOrder: string[] = [];
    const dispatch = vi.fn((_untilMs: number) => {
      callOrder.push("dispatch");
    });
    const write = vi.fn(async (_untilMs: number, _nowMs: number) => {
      callOrder.push("write");
    });

    await applyOfflineSnooze(nowMs, { dispatch, write });

    const expectedUntil = nowMs + OFFLINE_SNOOZE_MS;
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expectedUntil);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expectedUntil, nowMs);
    expect(callOrder).toEqual(["dispatch", "write"]);
  });

  it("com write null: só dispatch roda e nada lança erro", async () => {
    const nowMs = 1_700_000_000_000;
    const dispatch = vi.fn();

    await expect(applyOfflineSnooze(nowMs, { dispatch, write: null })).resolves.toBeUndefined();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(nowMs + OFFLINE_SNOOZE_MS);
  });
});



