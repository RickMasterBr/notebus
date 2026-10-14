import { describe, expect, it } from "vitest";
import {
  locationChange,
  locationEdit,
  stopLocationView,
  type StopOriginalLocation,
} from "./stopLocationEdit";

describe("stopLocationEdit", () => {
  const noneOriginal: StopOriginalLocation = {
    lat: null,
    lon: null,
    locationSource: null,
  };
  const officialOriginal: StopOriginalLocation = {
    lat: 39.7436,
    lon: -8.8071,
    locationSource: null,
  };
  const suggestedOriginal: StopOriginalLocation = {
    lat: 39.7436,
    lon: -8.8071,
    locationSource: "suggested",
  };
  const manualOriginal: StopOriginalLocation = {
    lat: 39.7436,
    lon: -8.8071,
    locationSource: "manual",
  };

  const pointA = { lat: 39.7436, lon: -8.8071 };
  const pointB = { lat: 39.75, lon: -8.81 };

  describe("locationChange e locationEdit", () => {
    it("ponto novo sem localização: unchanged e undefined", () => {
      expect(locationChange(noneOriginal, null)).toBe("unchanged");
      expect(locationEdit(noneOriginal, null)).toBeUndefined();
    });

    it("ponto novo com localização: set e o ponto", () => {
      expect(locationChange(noneOriginal, pointA)).toBe("set");
      expect(locationEdit(noneOriginal, pointA)).toEqual(pointA);
    });

    it("ponto oficial sem mudança: unchanged e undefined", () => {
      expect(locationChange(officialOriginal, pointA)).toBe("unchanged");
      expect(locationEdit(officialOriginal, pointA)).toBeUndefined();
    });

    it("ponto com localização sugerida sem mudança: unchanged e undefined", () => {
      expect(locationChange(suggestedOriginal, pointA)).toBe("unchanged");
      expect(locationEdit(suggestedOriginal, pointA)).toBeUndefined();
    });

    it("ponto marcado e movido: set e o novo ponto", () => {
      expect(locationChange(manualOriginal, pointB)).toBe("set");
      expect(locationEdit(manualOriginal, pointB)).toEqual(pointB);
    });

    it("ponto com localização removida: clear e null", () => {
      expect(locationChange(officialOriginal, null)).toBe("clear");
      expect(locationEdit(officialOriginal, null)).toBeNull();
    });

    it("ponto sem localização que ganha uma: set e o ponto", () => {
      expect(locationChange(noneOriginal, pointB)).toBe("set");
      expect(locationEdit(noneOriginal, pointB)).toEqual(pointB);
    });

    it("mover para o mesmo lugar (mesmas coordenadas): unchanged e undefined", () => {
      expect(locationChange(officialOriginal, { lat: 39.7436, lon: -8.8071 })).toBe("unchanged");
      expect(locationEdit(officialOriginal, { lat: 39.7436, lon: -8.8071 })).toBeUndefined();
    });

    it("mesma latitude e longitude diferente: set e o novo ponto", () => {
      expect(locationChange(officialOriginal, { lat: 39.7436, lon: -8.82 })).toBe("set");
      expect(locationEdit(officialOriginal, { lat: 39.7436, lon: -8.82 })).toEqual({
        lat: 39.7436,
        lon: -8.82,
      });
    });

    it("longitude igual e latitude diferente: set e o novo ponto", () => {
      expect(locationChange(officialOriginal, { lat: 39.75, lon: -8.8071 })).toBe("set");
      expect(locationEdit(officialOriginal, { lat: 39.75, lon: -8.8071 })).toEqual({
        lat: 39.75,
        lon: -8.8071,
      });
    });
  });

  describe("stopLocationView", () => {
    it("ponto novo sem localização: none, canRemove falso, changed falso", () => {
      expect(stopLocationView(noneOriginal, null)).toEqual({
        statusKey: "stop_edit.location.none",
        openKey: "map_pick.open",
        canRemove: false,
        changed: false,
      });
    });

    it("ponto novo com localização: manual, canRemove verdadeiro, changed verdadeiro", () => {
      expect(stopLocationView(noneOriginal, pointA)).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
        changed: true,
      });
    });

    it("ponto oficial sem mudança: official, canRemove verdadeiro, changed falso", () => {
      expect(stopLocationView(officialOriginal, pointA)).toEqual({
        statusKey: "stop_edit.location.official",
        openKey: "map_pick.open",
        canRemove: true,
        changed: false,
      });
    });

    it("ponto com localização sugerida sem mudança: suggested, canRemove verdadeiro, changed falso", () => {
      expect(stopLocationView(suggestedOriginal, pointA)).toEqual({
        statusKey: "stop_edit.location.suggested",
        openKey: "map_pick.open",
        canRemove: true,
        changed: false,
      });
    });

    it("ponto marcado e movido: manual, canRemove verdadeiro, changed verdadeiro", () => {
      expect(stopLocationView(manualOriginal, pointB)).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
        changed: true,
      });
    });

    it("ponto com localização removida: none, canRemove falso, changed verdadeiro", () => {
      expect(stopLocationView(officialOriginal, null)).toEqual({
        statusKey: "stop_edit.location.none",
        openKey: "map_pick.open",
        canRemove: false,
        changed: true,
      });
    });

    it("ponto sem localização que ganha uma: manual, canRemove verdadeiro, changed verdadeiro", () => {
      expect(stopLocationView(noneOriginal, pointB)).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
        changed: true,
      });
    });

    it("mover para o mesmo lugar: mantém statusKey oficial, canRemove verdadeiro, changed falso", () => {
      expect(stopLocationView(officialOriginal, { lat: 39.7436, lon: -8.8071 })).toEqual({
        statusKey: "stop_edit.location.official",
        openKey: "map_pick.open",
        canRemove: true,
        changed: false,
      });
    });

    it("mesma latitude e longitude diferente: manual, canRemove verdadeiro, changed verdadeiro", () => {
      expect(stopLocationView(officialOriginal, { lat: 39.7436, lon: -8.82 })).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
        changed: true,
      });
    });

    it("longitude igual e latitude diferente: manual, canRemove verdadeiro, changed verdadeiro", () => {
      expect(stopLocationView(officialOriginal, { lat: 39.75, lon: -8.8071 })).toEqual({
        statusKey: "stop_edit.location.manual",
        openKey: "map_pick.open",
        canRemove: true,
        changed: true,
      });
    });
  });
});
