import { describe, expect, it } from "vitest";
import { DOMAIN_CONFIG, type GeoPoint, type PositionFix } from "@notebus/domain";
import {
  MAP_START_GPS_WAIT_MS,
  MAP_START_PLACES_WAIT_MS,
  canStartMapOpening,
  createMapStarter,
  findCasaPoint,
  resolveMapStart,
} from "./mapStart";

const NOW = 1_000_000;
const LEIRIA_GPS: PositionFix = {
  lat: 39.745,
  lon: -8.805,
  accuracyM: 20,
  atMs: NOW - 5_000,
};
const CASA: GeoPoint = { lat: 39.75, lon: -8.81 };
const ULTIMA_POSICAO: GeoPoint = { lat: 39.74, lon: -8.82 };
const LISBOA_GPS: PositionFix = {
  lat: 38.7223,
  lon: -9.1393,
  accuracyM: 15,
  atMs: NOW - 5_000,
};

describe("onde o mapa abre (mapStart)", () => {
  it("GPS bom abre no GPS", async () => {
    const opening = await resolveMapStart({
      permission: "granted",
      getFix: () => LEIRIA_GPS,
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });

    expect(opening.source).toBe("gps");
    expect(opening.point).toEqual({ lat: LEIRIA_GPS.lat, lon: LEIRIA_GPS.lon });
  });

  it("GPS ruim ou velho cai em Casa", async () => {
    const fixRuim: PositionFix = { ...LEIRIA_GPS, accuracyM: 150 }; // precisão ruim > 100m
    const openingRuim = await resolveMapStart({
      permission: "granted",
      getFix: () => fixRuim,
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });
    expect(openingRuim.source).toBe("home");
    expect(openingRuim.point).toEqual(CASA);

    const fixVelho: PositionFix = { ...LEIRIA_GPS, atMs: NOW - 15 * 60 * 1000 }; // 15 min > 10 min
    const openingVelho = await resolveMapStart({
      permission: "granted",
      getFix: () => fixVelho,
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });
    expect(openingVelho.source).toBe("home");
    expect(openingVelho.point).toEqual(CASA);
  });

  it("sem Casa cai na última posição", async () => {
    const fixRuim: PositionFix = { ...LEIRIA_GPS, accuracyM: 200 };
    const opening = await resolveMapStart({
      permission: "granted",
      getFix: () => fixRuim,
      home: null,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });

    expect(opening.source).toBe("last");
    expect(opening.point).toEqual(ULTIMA_POSICAO);
  });

  it("sem nada cai em Leiria", async () => {
    const opening = await resolveMapStart({
      permission: "denied",
      getFix: () => null,
      home: null,
      lastMapPosition: null,
      nowMs: NOW,
    });

    expect(opening.source).toBe("leiria");
    expect(opening.point).toEqual(DOMAIN_CONFIG.leiriaCenter);
  });

  it("GPS a mais de 30 km (Lisboa) abre em Casa", async () => {
    const opening = await resolveMapStart({
      permission: "granted",
      getFix: () => LISBOA_GPS,
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });

    expect(opening.source).toBe("home");
    expect(opening.point).toEqual(CASA);
  });

  it("com permissão e sem fix espera até o limite e depois decide sem GPS", async () => {
    let waitedMs = 0;
    const fakeSleep = async (ms: number) => {
      waitedMs = ms;
    };

    const listeners: (() => void)[] = [];
    const opening = await resolveMapStart({
      permission: "granted",
      getFix: () => null,
      subscribeFix: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
      sleep: fakeSleep,
    });

    expect(waitedMs).toBe(1_500);
    expect(opening.source).toBe("home");
    expect(opening.point).toEqual(CASA);
  });

  it("fix que chega dentro do limite vale", async () => {
    let currentFix: PositionFix | null = null;
    const listeners: (() => void)[] = [];

    // O sleep simula um temporizador real que respeita timeoutMs
    const fakeSleep = (timeoutMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      });

    // O fix chega aos 20 ms (bem antes dos 1500 ms)
    setTimeout(() => {
      currentFix = LEIRIA_GPS;
      listeners.forEach((l) => l());
    }, 20);

    const opening = await resolveMapStart({
      permission: "granted",
      getFix: () => currentFix,
      subscribeFix: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
      sleep: fakeSleep,
    });

    expect(opening.source).toBe("gps");
    expect(opening.point).toEqual({ lat: LEIRIA_GPS.lat, lon: LEIRIA_GPS.lon });
  });

  it("depois de decidido, um fix novo não muda o resultado", async () => {
    let currentFix: PositionFix | null = null;
    const listeners: (() => void)[] = [];

    const starter = createMapStarter({
      permission: "denied",
      getFix: () => currentFix,
      subscribeFix: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      home: CASA,
      lastMapPosition: ULTIMA_POSICAO,
      nowMs: NOW,
    });

    const first = await starter.resolve();
    expect(first.source).toBe("home");
    expect(first.point).toEqual(CASA);

    // Agora chega um fix bom
    currentFix = LEIRIA_GPS;
    listeners.forEach((l) => l());

    const second = await starter.resolve();
    expect(second).toBe(first);
    expect(second.source).toBe("home");
    expect(second.point).toEqual(CASA);
  });

  describe("findCasaPoint", () => {
    it("acha lugar Casa ativo com coordenadas", () => {
      const places = [
        { name: "Trabalho", lat: 39.7, lon: -8.8, deletedAt: null },
        { name: "  casa  ", lat: 39.75, lon: -8.81, deletedAt: null },
      ];
      expect(findCasaPoint(places)).toEqual({ lat: 39.75, lon: -8.81 });
    });

    it("ignora Casa apagada ou sem coordenadas", () => {
      expect(findCasaPoint([{ name: "Casa", lat: 39.75, lon: -8.81, deletedAt: 123 }])).toBeNull();
      expect(findCasaPoint([{ name: "Casa", lat: null, lon: -8.81, deletedAt: null }])).toBeNull();
      expect(findCasaPoint([])).toBeNull();
    });
  });

  describe("canStartMapOpening (Item 0.1)", () => {
    it("com placesStatus loading não decide antes de 3000 ms", () => {
      expect(canStartMapOpening({ placesStatus: "loading", elapsedMs: 0 })).toBe(false);
      expect(canStartMapOpening({ placesStatus: "loading", elapsedMs: 1500 })).toBe(false);
      expect(canStartMapOpening({ placesStatus: "loading", elapsedMs: 2999 })).toBe(false);
    });

    it("com placesStatus loading e teto de segurança de 3000 ms decide sem Casa", () => {
      expect(canStartMapOpening({ placesStatus: "loading", elapsedMs: 3000 })).toBe(true);
      expect(canStartMapOpening({ placesStatus: "loading", elapsedMs: 5000 })).toBe(true);
    });

    it("com placesStatus ready decide", () => {
      expect(canStartMapOpening({ placesStatus: "ready" })).toBe(true);
    });

    it("com placesStatus error decide", () => {
      expect(canStartMapOpening({ placesStatus: "error" })).toBe(true);
    });
  });

  describe("espera por lugares no starter (Item 0.1)", () => {
    it("com placesStatus loading aguarda places ready e decide com Casa", async () => {
      let placesStatus: "loading" | "ready" = "loading";
      let homePoint: GeoPoint | null = null;
      const listeners: (() => void)[] = [];

      const fakeSleep = (timeoutMs: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, timeoutMs);
        });

      setTimeout(() => {
        placesStatus = "ready";
        homePoint = CASA;
        listeners.forEach((l) => l());
      }, 20);

      const opening = await resolveMapStart({
        permission: "denied",
        getFix: () => null,
        placesStatus: () => placesStatus,
        getHome: () => homePoint,
        subscribePlaces: (fn) => {
          listeners.push(fn);
          return () => {};
        },
        lastMapPosition: ULTIMA_POSICAO,
        nowMs: NOW,
        sleep: fakeSleep,
      });

      expect(opening.source).toBe("home");
      expect(opening.point).toEqual(CASA);
    });

    it("com placesStatus loading até o teto de 3000 ms decide sem Casa", async () => {
      let waitedMs = 0;
      const fakeSleep = async (ms: number) => {
        waitedMs = ms;
      };

      const opening = await resolveMapStart({
        permission: "denied",
        getFix: () => null,
        placesStatus: () => "loading",
        getHome: () => null,
        subscribePlaces: () => () => {},
        lastMapPosition: ULTIMA_POSICAO,
        nowMs: NOW,
        sleep: fakeSleep,
      });

      expect(waitedMs).toBe(3_000);
      expect(opening.source).toBe("last");
      expect(opening.point).toEqual(ULTIMA_POSICAO);
    });
  });
});
