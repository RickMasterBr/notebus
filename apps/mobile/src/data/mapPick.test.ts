import { describe, expect, it } from "vitest";
import {
  PICK_ZOOM_EXISTING,
  PICK_ZOOM_OPENING,
  pickStart,
  resolvePick,
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
});
