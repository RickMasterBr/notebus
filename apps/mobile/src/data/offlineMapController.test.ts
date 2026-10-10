import { describe, expect, it } from "vitest";
import {
  reduceOfflineMap,
  type OfflineControllerState,
} from "./offlineMapController";
import { shouldOfferOfflineMap, snoozedUntil } from "./mapOfflineState";

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
