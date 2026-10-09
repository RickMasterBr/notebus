import { describe, expect, it } from "vitest";
import { buildMapPoints, collectStopsWithRecords } from "./mapPoints";

describe("mapPoints (Item 1)", () => {
  it("coordenada GeoJSON fica na ordem [lon, lat]", () => {
    const locations = [{ id: "stop-1", lat: 39.745, lon: -8.805 }];
    const names = new Map([["stop-1", "Ponto 1"]]);
    const stopsWithRecords = new Set<string>();

    const geojson = buildMapPoints({ locations, names, stopsWithRecords });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.geometry.coordinates).toEqual([-8.805, 39.745]);
    expect(geojson.features[0]!.properties.id).toBe("stop-1");
    expect(geojson.features[0]!.properties.name).toBe("Ponto 1");
    expect(geojson.features[0]!.properties.filled).toBe(false);
  });

  it("ponto com registro vivo fica cheio (filled = true) e sem registro fica vazado (filled = false)", () => {
    const locations = [
      { id: "stop-1", lat: 39.745, lon: -8.805 },
      { id: "stop-2", lat: 39.746, lon: -8.806 },
    ];
    const names = new Map([
      ["stop-1", "Ponto 1"],
      ["stop-2", "Ponto 2"],
    ]);
    const stopsWithRecords = new Set(["stop-1"]);

    const geojson = buildMapPoints({ locations, names, stopsWithRecords });

    expect(geojson.features[0]!.properties.filled).toBe(true);
    expect(geojson.features[1]!.properties.filled).toBe(false);
  });

  it("collectStopsWithRecords ignora registros apagados", () => {
    const observations = [
      { stopId: "stop-1", deletedAt: null },
      { stopId: "stop-2", deletedAt: 123456 }, // apagado
      { stopId: "stop-3", deletedAt: undefined }, // vivo
    ];

    const stopsWithRecords = collectStopsWithRecords(observations);

    expect(stopsWithRecords.has("stop-1")).toBe(true);
    expect(stopsWithRecords.has("stop-2")).toBe(false);
    expect(stopsWithRecords.has("stop-3")).toBe(true);
  });

  it("ponto sem coordenada válida fica de fora", () => {
    const locations = [
      { id: "stop-valido", lat: 39.745, lon: -8.805 },
      { id: "stop-invalido-lat", lat: 95.0, lon: -8.805 },
      { id: "stop-invalido-zero", lat: 0, lon: 0 },
    ];
    const names = new Map([
      ["stop-valido", "Válido"],
      ["stop-invalido-lat", "Inválido Lat"],
      ["stop-invalido-zero", "Inválido Zero"],
    ]);
    const stopsWithRecords = new Set<string>();

    const geojson = buildMapPoints({ locations, names, stopsWithRecords });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.properties.id).toBe("stop-valido");
  });

  it("ponto sem nome no índice entra com nome vazio", () => {
    const locations = [{ id: "stop-sem-nome", lat: 39.745, lon: -8.805 }];
    const names = new Map<string, string>(); // vazio
    const stopsWithRecords = new Set<string>();

    const geojson = buildMapPoints({ locations, names, stopsWithRecords });

    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0]!.properties.name).toBe("");
  });

  it("lista vazia dá coleção vazia", () => {
    const geojson = buildMapPoints({
      locations: [],
      names: new Map(),
      stopsWithRecords: new Set(),
    });

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toEqual([]);
  });
});
