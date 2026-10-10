import { describe, expect, it, vi } from "vitest";
import {
  PICK_MAX_ZOOM,
  PICK_ZOOM_EXISTING,
  PICK_ZOOM_OPENING,
  applyStopUndo,
  pickStart,
  resolvePick,
  runPickResult,
  shouldResolveStart,
  tapPin,
  undoForStopLocation,
} from "./mapPick";

describe("mapPick (Item 1)", () => {
  const LEIRIA_CENTER = { lat: 39.7437, lon: -8.8071 };
  const NOW = 1_700_000_000_000;

  describe("pickStart", () => {
    it("existing válido devolve source existing, zoom 16 e pin igual ao existing", () => {
      const existing = { lat: 39.75, lon: -8.8 };
      const res = pickStart({
        existing,
        fix: null,
        nowMs: NOW,
        home: null,
        lastMapPosition: null,
      });
      expect(res).toEqual({
        point: existing,
        source: "existing",
        zoom: PICK_ZOOM_EXISTING,
        pin: existing,
      });
    });

    it("sem existing, fix bom recente devolve source gps, zoom 14 e pin nulo", () => {
      const fix = {
        lat: 39.74,
        lon: -8.8,
        accuracyM: 20,
        atMs: NOW - 30_000,
      };
      const res = pickStart({
        existing: null,
        fix,
        nowMs: NOW,
        home: null,
        lastMapPosition: null,
      });
      expect(res).toEqual({
        point: { lat: fix.lat, lon: fix.lon },
        source: "gps",
        zoom: PICK_ZOOM_OPENING,
        pin: null,
      });
    });

    it("sem existing, fix em Lisboa (>30km) e home em Leiria devolve source home (D-110)", () => {
      const fixLisboa = {
        lat: 38.7223,
        lon: -9.1393,
        accuracyM: 20,
        atMs: NOW - 10_000,
      };
      const home = { lat: 39.75, lon: -8.81 };
      const res = pickStart({
        existing: null,
        fix: fixLisboa,
        nowMs: NOW,
        home,
        lastMapPosition: null,
      });
      expect(res).toEqual({
        point: home,
        source: "home",
        zoom: PICK_ZOOM_OPENING,
        pin: null,
      });
    });

    it("sem nada devolve source leiria e centro de Leiria", () => {
      const res = pickStart({
        existing: null,
        fix: null,
        nowMs: NOW,
        home: null,
        lastMapPosition: null,
      });
      expect(res).toEqual({
        point: LEIRIA_CENTER,
        source: "leiria",
        zoom: PICK_ZOOM_OPENING,
        pin: null,
      });
    });

    it("existing {0, 0} não é válido e cai na abertura", () => {
      const res = pickStart({
        existing: { lat: 0, lon: 0 },
        fix: null,
        nowMs: NOW,
        home: null,
        lastMapPosition: null,
      });
      expect(res.source).toBe("leiria");
      expect(res.pin).toBeNull();
      expect(res.point).toEqual(LEIRIA_CENTER);
    });
  });

  describe("tapPin", () => {
    it("pin nulo + toque A vira A; toque B move para B; toque fora da faixa ou zero mantém B", () => {
      const state0 = { pin: null };
      const pointA = { lat: 39.74, lon: -8.8 };
      const pointB = { lat: 39.75, lon: -8.81 };

      const state1 = tapPin(state0, pointA);
      expect(state1).toEqual({ pin: pointA });

      const state2 = tapPin(state1, pointB);
      expect(state2).toEqual({ pin: pointB });

      // toque {95, 0} (lat fora da faixa) -> mantém pointB
      const state3 = tapPin(state2, { lat: 95, lon: 0 });
      expect(state3).toEqual({ pin: pointB });

      // toque {0, 0} (par 0, 0) -> mantém pointB
      const state4 = tapPin(state2, { lat: 0, lon: 0 });
      expect(state4).toEqual({ pin: pointB });
    });
  });

  describe("resolvePick", () => {
    it("sem pin devolve disabled", () => {
      expect(resolvePick({ pin: null })).toEqual({ kind: "disabled" });
    });

    it("pin em Leiria {39.75, -8.80} devolve ok", () => {
      const point = { lat: 39.75, lon: -8.8 };
      expect(resolvePick({ pin: point })).toEqual({ kind: "ok", point });
    });

    it("pin em Lisboa {38.7223, -9.1393} (>50 km) devolve far", () => {
      const point = { lat: 38.7223, lon: -9.1393 };
      expect(resolvePick({ pin: point })).toEqual({ kind: "far", point });
    });
  });

  describe("undoForStopLocation", () => {
    it("null devolve clear", () => {
      expect(undoForStopLocation(null)).toEqual({ kind: "clear" });
    });

    it("com valor manual devolve restore manual", () => {
      expect(undoForStopLocation({ lat: 39.74, lon: -8.8, source: "manual" })).toEqual({
        kind: "restore",
        point: { lat: 39.74, lon: -8.8 },
        source: "manual",
      });
    });

    it("com source null devolve restore com manual", () => {
      expect(undoForStopLocation({ lat: 39.74, lon: -8.8, source: null })).toEqual({
        kind: "restore",
        point: { lat: 39.74, lon: -8.8 },
        source: "manual",
      });
    });
  });

  describe("constantes fixadas", () => {
    it("PICK_ZOOM_EXISTING === 16, PICK_ZOOM_OPENING === 14, PICK_MAX_ZOOM === 16, PICK_MAX_ZOOM >= PICK_ZOOM_EXISTING", () => {
      expect(PICK_ZOOM_EXISTING).toBe(16);
      expect(PICK_ZOOM_OPENING).toBe(14);
      expect(PICK_MAX_ZOOM).toBe(16);
      expect(PICK_MAX_ZOOM).toBeGreaterThanOrEqual(PICK_ZOOM_EXISTING);
    });
  });

  describe("runPickResult", () => {
    it("disabled não chama nada", () => {
      const onConfirm = vi.fn();
      const askFar = vi.fn();
      runPickResult({ kind: "disabled" }, { onConfirm, askFar });
      expect(onConfirm).not.toHaveBeenCalled();
      expect(askFar).not.toHaveBeenCalled();
    });

    it("ok chama onConfirm(point) e não chama askFar", () => {
      const onConfirm = vi.fn();
      const askFar = vi.fn();
      const point = { lat: 39.74, lon: -8.8 };
      runPickResult({ kind: "ok", point }, { onConfirm, askFar });
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(point);
      expect(askFar).not.toHaveBeenCalled();
    });

    it("far chama askFar(point) e não chama onConfirm", () => {
      const onConfirm = vi.fn();
      const askFar = vi.fn();
      const point = { lat: 38.72, lon: -9.14 };
      runPickResult({ kind: "far", point }, { onConfirm, askFar });
      expect(askFar).toHaveBeenCalledTimes(1);
      expect(askFar).toHaveBeenCalledWith(point);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("applyStopUndo", () => {
    it("clear chama clear(stopId) e não chama save", async () => {
      const clear = vi.fn(async () => {});
      const save = vi.fn(async () => {});
      await applyStopUndo({ kind: "clear" }, "stop-1", { clear, save });
      expect(clear).toHaveBeenCalledTimes(1);
      expect(clear).toHaveBeenCalledWith("stop-1");
      expect(save).not.toHaveBeenCalled();
    });

    it("restore chama save(stopId, undo.point, undo.source) e não chama clear", async () => {
      const clear = vi.fn(async () => {});
      const save = vi.fn(async () => {});
      const point = { lat: 39.74, lon: -8.8 };
      await applyStopUndo(
        { kind: "restore", point, source: "manual" },
        "stop-1",
        { clear, save },
      );
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith("stop-1", point, "manual");
      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe("shouldResolveStart", () => {
    it("as 4 combinações: só true com alreadyResolved === false e placesReady === true", () => {
      expect(shouldResolveStart({ alreadyResolved: false, placesReady: true })).toBe(true);
      expect(shouldResolveStart({ alreadyResolved: true, placesReady: true })).toBe(false);
      expect(shouldResolveStart({ alreadyResolved: false, placesReady: false })).toBe(false);
      expect(shouldResolveStart({ alreadyResolved: true, placesReady: false })).toBe(false);
    });
  });
});
