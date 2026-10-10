import { describe, expect, it } from "vitest";
import {
  combineProgress,
  estimateMegabytes,
  megabytesText,
  OFFLINE_PACK_DARK,
  OFFLINE_PACK_LIGHT,
  OFFLINE_SNOOZE_MS,
  OFFLINE_SNOOZED_UNTIL,
  percentOf,
  shouldOfferOfflineMap,
  snoozedUntil,
  statusFromPacks,
  type OfflineMapStatus,
} from "./mapOfflineState";

describe("mapOfflineState (Item 2 & 3)", () => {
  describe("snoozedUntil", () => {
    it("adiciona exatamente 7 dias (OFFLINE_SNOOZE_MS) a nowMs", () => {
      const now = 1_000_000;
      expect(snoozedUntil(now)).toBe(now + 7 * 24 * 60 * 60 * 1000);
      expect(OFFLINE_SNOOZE_MS).toBe(604_800_000);
    });
  });

  describe("shouldOfferOfflineMap", () => {
    const baseNow = 1_700_000_000_000;

    it("oferece quando mapa está visível, status none e sem soneca", () => {
      expect(
        shouldOfferOfflineMap({
          status: { kind: "none" },
          mapVisible: true,
          snoozedUntilMs: null,
          nowMs: baseNow,
        }),
      ).toBe(true);
    });

    it("oferece quando mapa está visível, status error e sem soneca", () => {
      expect(
        shouldOfferOfflineMap({
          status: { kind: "error" },
          mapVisible: true,
          snoozedUntilMs: null,
          nowMs: baseNow,
        }),
      ).toBe(true);
    });

    it("não oferece se o mapa não está visível (mapVisible = false)", () => {
      expect(
        shouldOfferOfflineMap({
          status: { kind: "none" },
          mapVisible: false,
          snoozedUntilMs: null,
          nowMs: baseNow,
        }),
      ).toBe(false);
    });

    it("não oferece quando status é downloading", () => {
      expect(
        shouldOfferOfflineMap({
          status: { kind: "downloading", percent: 45 },
          mapVisible: true,
          snoozedUntilMs: null,
          nowMs: baseNow,
        }),
      ).toBe(false);
    });

    it("não oferece quando status é ready", () => {
      expect(
        shouldOfferOfflineMap({
          status: { kind: "ready", bytes: 9_000_000 },
          mapVisible: true,
          snoozedUntilMs: null,
          nowMs: baseNow,
        }),
      ).toBe(false);
    });

    it("fronteira da soneca: não oferece antes, oferece exatamente na fronteira e após", () => {
      const snoozed = baseNow + 10_000;

      // 1 ms antes da soneca: não oferece
      expect(
        shouldOfferOfflineMap({
          status: { kind: "none" },
          mapVisible: true,
          snoozedUntilMs: snoozed,
          nowMs: snoozed - 1,
        }),
      ).toBe(false);

      // Exatamente no instante da soneca: oferece (nowMs === snoozedUntilMs)
      expect(
        shouldOfferOfflineMap({
          status: { kind: "none" },
          mapVisible: true,
          snoozedUntilMs: snoozed,
          nowMs: snoozed,
        }),
      ).toBe(true);

      // Depois da soneca: oferece
      expect(
        shouldOfferOfflineMap({
          status: { kind: "none" },
          mapVisible: true,
          snoozedUntilMs: snoozed,
          nowMs: snoozed + 1,
        }),
      ).toBe(true);
    });
  });

  describe("percentOf", () => {
    it("devolve 0 com total <= 0", () => {
      expect(percentOf(10, 0)).toBe(0);
      expect(percentOf(10, -5)).toBe(0);
      expect(percentOf(0, 0)).toBe(0);
    });

    it("devolve 0 com done <= 0", () => {
      expect(percentOf(0, 100)).toBe(0);
      expect(percentOf(-5, 100)).toBe(0);
    });

    it("devolve 100 com done maior que total (nunca passa de 100)", () => {
      expect(percentOf(150, 100)).toBe(100);
      expect(percentOf(101, 100)).toBe(100);
      expect(percentOf(100, 100)).toBe(100);
    });

    it("calcula percentual inteiro intermediário", () => {
      expect(percentOf(50, 100)).toBe(50);
      expect(percentOf(1, 3)).toBe(33);
      expect(percentOf(999, 1000)).toBe(99);
    });
  });

  describe("megabytesText", () => {
    it("formata 9_542_041 bytes como '9,1'", () => {
      expect(megabytesText(9_542_041)).toBe("9,1");
    });

    it("formata 0 ou negativo como '0,0'", () => {
      expect(megabytesText(0)).toBe("0,0");
      expect(megabytesText(-100)).toBe("0,0");
    });

    it("formata números redondos com vírgula", () => {
      expect(megabytesText(10 * 1024 * 1024)).toBe("10,0");
    });
  });

  describe("estimateMegabytes", () => {
    it("estima 180 tiles como 14.1 (tileCount * OFFLINE_KB_PER_TILE / 1024)", () => {
      // 180 * 80 / 1024 = 14.0625 -> 14.1
      expect(estimateMegabytes(180)).toBe(14.1);
      expect(estimateMegabytes(391)).toBe(30.5);
      expect(Math.abs(estimateMegabytes(180) - 14.1)).toBeLessThanOrEqual(0.1);
    });

    it("devolve 0 para tileCount <= 0", () => {
      expect(estimateMegabytes(0)).toBe(0);
      expect(estimateMegabytes(-10)).toBe(0);
    });
  });

  describe("statusFromPacks e combineProgress (Item 3 puro)", () => {
    it("nenhum pacote: devolve { kind: 'none' }", () => {
      expect(statusFromPacks([])).toEqual({ kind: "none" });
    });

    it("um só pacote (incompleto): devolve { kind: 'none' }", () => {
      // 1 pacote inativo ou incompleto
      expect(
        statusFromPacks([
          {
            name: OFFLINE_PACK_LIGHT,
            state: "inactive",
            percentage: 50,
            completedResourceSize: 4_000_000,
          },
        ]),
      ).toEqual({ kind: "none" });

      // 1 pacote completo, mas falta o outro
      expect(
        statusFromPacks([
          {
            name: OFFLINE_PACK_LIGHT,
            state: "complete",
            percentage: 100,
            completedResourceSize: 4_500_000,
          },
        ]),
      ).toEqual({ kind: "none" });
    });

    it("dois pacotes completos: devolve { kind: 'ready', bytes } com a soma", () => {
      const packs = [
        {
          name: OFFLINE_PACK_LIGHT,
          state: "complete" as const,
          percentage: 100,
          completedResourceSize: 4_500_000,
        },
        {
          name: OFFLINE_PACK_DARK,
          state: "complete" as const,
          percentage: 100,
          completedResourceSize: 4_600_000,
        },
      ];
      expect(statusFromPacks(packs)).toEqual({
        kind: "ready",
        bytes: 9_100_000,
      });
    });

    it("um com erro: devolve { kind: 'error' }", () => {
      const packs = [
        {
          name: OFFLINE_PACK_LIGHT,
          state: "error" as const,
          percentage: 30,
        },
        {
          name: OFFLINE_PACK_DARK,
          state: "complete" as const,
          percentage: 100,
        },
      ];
      expect(statusFromPacks(packs)).toEqual({ kind: "error" });
    });

    it("um em andamento: devolve { kind: 'downloading', percent } com o combinado", () => {
      const packs = [
        {
          name: OFFLINE_PACK_LIGHT,
          state: "active" as const,
          percentage: 40,
        },
        {
          name: OFFLINE_PACK_DARK,
          state: "inactive" as const,
          percentage: 0,
        },
      ];
      expect(statusFromPacks(packs)).toEqual({
        kind: "downloading",
        percent: 20,
      });
    });

    it("combineProgress combina múltiplos progressos corretamente", () => {
      expect(combineProgress([])).toBe(0);
      expect(combineProgress([50, 50])).toBe(50);
      expect(combineProgress([100, 0])).toBe(50);
      expect(combineProgress([80, 20])).toBe(50);
      expect(combineProgress([{ done: 10, total: 20 }, { done: 20, total: 20 }])).toBe(75);
    });
  });
});
