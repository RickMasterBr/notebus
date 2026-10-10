/// <reference types="node" />
import { describe, expect, it } from "vitest";
import {
  baseTimes,
  controlPositions,
  officialTag,
  stopSecondary,
} from "./networkView";
import type { ScheduleSnapshot } from "./schedule";

describe("data/networkView: lógica pura da rede (TL-11, Item 2)", () => {
  describe("officialTag", () => {
    it("identifica fontes oficiais e do usuário", () => {
      expect(officialTag("official")).toBe(true);
      expect(officialTag("official_edited")).toBe(true);
      expect(officialTag("user")).toBe(false);
    });
  });

  describe("stopSecondary", () => {
    it("devolve apelidos e ID externo juntos", () => {
      expect(
        stopSecondary({ aliases: ["Campus", "ESTG"], externalId: "3479" }),
      ).toBe("Também: Campus, ESTG · ID 3479");
    });

    it("devolve só apelidos quando não há ID", () => {
      expect(stopSecondary({ aliases: ["Campus"], externalId: null })).toBe(
        "Também: Campus",
      );
    });

    it("devolve só ID quando não há apelidos", () => {
      expect(stopSecondary({ aliases: [], externalId: "3479" })).toBe("ID 3479");
    });

    it("devolve null quando não há nenhum", () => {
      expect(stopSecondary({ aliases: [], externalId: null })).toBeNull();
      expect(stopSecondary({ aliases: null, externalId: "" })).toBeNull();
    });
  });

  describe("controlPositions", () => {
    it("embrulha timepointPositions do domínio", () => {
      const pattern = {
        id: "p1",
        stops: [
          { position: 1, stopId: "s1", isTimepoint: true },
          { position: 2, stopId: "s2", isTimepoint: false },
        ],
      };
      const trips = [
        {
          id: "t1",
          patternId: "p1",
          firstPosition: 1,
          lastPosition: 2,
          stopTimes: [{ position: 2, serviceMinute: 500, origin: "official" as const }],
        },
      ];
      const positions = controlPositions(pattern, trips);
      expect(positions.has(1)).toBe(true);
      expect(positions.has(2)).toBe(true);
    });
  });

  describe("baseTimes", () => {
    const buildSnapshot = (tripsOrder: "normal" | "shuffled"): ScheduleSnapshot => {
      const normalTrips = [
        {
          id: "trip-w1",
          patternId: "p1",
          firstPosition: 1,
          lastPosition: 3,
          stopTimes: [
            { position: 1, serviceMinute: 480, origin: "official" as const }, // 08:00
            { position: 3, serviceMinute: 510, origin: "official" as const },
          ],
        },
        {
          id: "trip-w2",
          patternId: "p1",
          firstPosition: 1,
          lastPosition: 3,
          stopTimes: [
            { position: 1, serviceMinute: 1510, origin: "official" as const }, // 25:10 -> 01:10
            { position: 3, serviceMinute: 1540, origin: "official" as const },
          ],
        },
        {
          id: "trip-w-partial",
          patternId: "p1",
          firstPosition: 2,
          lastPosition: 3,
          stopTimes: [
            { position: 2, serviceMinute: 600, origin: "official" as const },
            { position: 3, serviceMinute: 620, origin: "official" as const },
          ],
        },
        {
          id: "trip-sat",
          patternId: "p1",
          firstPosition: 1,
          lastPosition: 3,
          stopTimes: [
            { position: 1, serviceMinute: 540, origin: "official" as const }, // 09:00
            { position: 3, serviceMinute: 570, origin: "official" as const },
          ],
        },
      ];

      const trips = tripsOrder === "normal"
        ? normalTrips
        : [normalTrips[1]!, normalTrips[3]!, normalTrips[0]!, normalTrips[2]!];

      return {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [
            { id: "trip-w1", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
            { id: "trip-w2", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
            { id: "trip-w-partial", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
            { id: "trip-sat", timetableId: "tt1", dayTypes: ["saturday"], seasonId: null },
          ],
          timetables: [{ id: "tt1", validFrom: "2026-09-01", validTo: null }],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            stops: [
              { position: 1, stopId: "s-terminal", isTimepoint: true },
              { position: 2, stopId: "s-meio", isTimepoint: false },
              { position: 3, stopId: "s-fim", isTimepoint: true },
            ],
          },
        ],
        trips,
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([
          ["s-terminal", "Terminal Central"],
          ["s-meio", "Paragem Meio"],
          ["s-fim", "Fim de Linha"],
        ]),
      };
    };

    it("filtra viagens de dia útil e sábado, viagem 25:10 fica por último como 01:10 e viagem parcial conta em partialCount", () => {
      const snapshot = buildSnapshot("normal");

      // Dia útil: 3 viagens (2 passam no ponto 1, 1 é parcial e não passa)
      const resWeekday = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(resWeekday.stopName).toBe("Terminal Central");
      expect(resWeekday.position).toBe(1);
      // Viagem de 25:10 (01:10) vem por último, ordenada pelo minuto de serviço
      expect(resWeekday.times).toEqual(["08:00", "01:10"]);
      expect(resWeekday.partialCount).toBe(1);
      expect(resWeekday.validFrom).toBe("2026-09-01");

      // Sábado: 1 viagem
      const resSat = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "saturday",
        todayLisbon: "2026-10-08",
      });
      expect(resSat.times).toEqual(["09:00"]);
      expect(resSat.partialCount).toBe(0);

      // Domingo e feriado: sem viagens
      const resSun = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "sunday_holiday",
        todayLisbon: "2026-10-08",
      });
      expect(resSun.times).toEqual([]);
      expect(resSun.partialCount).toBe(0);
    });

    it("ordem da entrada embaralhada não altera a saída", () => {
      const snapshotShuffled = buildSnapshot("shuffled");
      const resWeekday = baseTimes({
        snapshot: snapshotShuffled,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(resWeekday.times).toEqual(["08:00", "01:10"]);
      expect(resWeekday.partialCount).toBe(1);
    });
  });
});
