/// <reference types="node" />
import { describe, expect, it } from "vitest";
import {
  baseTimes,
  controlPositions,
  officialTag,
  stopSecondary,
  validFromText,
} from "./networkView";
import type { ScheduleSnapshot } from "./schedule";

describe("data/networkView: lógica pura da rede (TL-11, Item 2)", () => {
  describe("validFromText (Item 4)", () => {
    it("converte data ISO para dd/mm/aaaa como dateNumbers", () => {
      expect(validFromText("2026-10-08")).toBe("08/10/2026");
      expect(validFromText("2025-01-01")).toBe("01/01/2025");
    });

    it("devolve data sem hífen como veio", () => {
      expect(validFromText("Outubro 2026")).toBe("Outubro 2026");
      expect(validFromText("2026")).toBe("2026");
    });

    it("devolve null para string vazia, espaços ou null", () => {
      expect(validFromText("")).toBeNull();
      expect(validFromText("   ")).toBeNull();
      expect(validFromText(null)).toBeNull();
    });
  });

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

    it("vigência: com duas tabelas, só a vigente hoje entra; sem nenhuma vigente, usa a mais recente", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [
            { id: "trip-old", timetableId: "tt-current", dayTypes: ["weekday"], seasonId: null },
            { id: "trip-future", timetableId: "tt-future", dayTypes: ["weekday"], seasonId: null },
          ],
          timetables: [
            { id: "tt-current", validFrom: "2026-06-01", validTo: null },
            { id: "tt-future", validFrom: "2027-01-01", validTo: null },
          ],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            stops: [{ position: 1, stopId: "s1", isTimepoint: true }],
          },
        ],
        trips: [
          {
            id: "trip-old",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 480, origin: "official" as const }],
          },
          {
            id: "trip-future",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 600, origin: "official" as const }],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s1", "Ponto Um"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });
      expect(res.validFrom).toBe("2026-06-01");
      expect(res.times).toEqual(["08:00"]);

      const snapshotPast: ScheduleSnapshot = {
        ...snapshot,
        schedule: {
          ...snapshot.schedule,
          timetables: [
            { id: "tt-old1", validFrom: "2024-01-01", validTo: "2024-06-01" },
            { id: "tt-old2", validFrom: "2024-06-02", validTo: "2024-12-31" },
          ],
          trips: [
            { id: "trip-old1", timetableId: "tt-old1", dayTypes: ["weekday"], seasonId: null },
            { id: "trip-old2", timetableId: "tt-old2", dayTypes: ["weekday"], seasonId: null },
          ],
        },
        trips: [
          {
            id: "trip-old1",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 420, origin: "official" as const }],
          },
          {
            id: "trip-old2",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 500, origin: "official" as const }],
          },
        ],
      };
      const resPast = baseTimes({
        snapshot: snapshotPast,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });
      expect(resPast.validFrom).toBe("2024-06-02");
      expect(resPast.times).toEqual(["08:20"]);
    });

    it("interpolação: viagem sem horário no ponto de controle mas que passa por ele entra com horário interpolado", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [{ id: "t1", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null }],
          timetables: [{ id: "tt1", validFrom: "2026-01-01", validTo: null }],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            // As paragens do percurso começam na posição 2 (o ponto de controle)
            stops: [
              { position: 2, stopId: "s2", isTimepoint: true },
              { position: 3, stopId: "s3", isTimepoint: true },
            ],
          },
        ],
        trips: [
          {
            id: "t1",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 3,
            // A viagem parte de 1 e termina em 3, com horários em 1 e 3, mas passa por 2
            stopTimes: [
              { position: 1, serviceMinute: 480, origin: "official" as const },
              { position: 3, serviceMinute: 540, origin: "official" as const },
            ],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s2", "Controle"], ["s3", "Fim"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(res.position).toBe(2);
      expect(res.stopName).toBe("Controle");
      // Interpola a posição 2 entre pos 1 e pos 3 (480 + (540-480)*((2-1)/(3-1)) = 510 min -> 08:30)
      expect(res.times).toEqual(["08:30"]);
      expect(res.partialCount).toBe(0);
    });

    it("viagem apagada (deletedAt) não entra na listagem", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [
            { id: "t-live", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
            { id: "t-deleted", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null, deletedAt: 1760000000000 },
          ],
          timetables: [{ id: "tt1", validFrom: "2026-01-01", validTo: null }],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            stops: [{ position: 1, stopId: "s1", isTimepoint: true }],
          },
        ],
        trips: [
          {
            id: "t-live",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 480, origin: "official" as const }],
          },
          {
            id: "t-deleted",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 500, origin: "official" as const }],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s1", "Ponto"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(res.times).toEqual(["08:00"]);
      expect(res.partialCount).toBe(0);
    });

    it("ponto de controle: usa o primeiro ponto de controle e não a primeira paragem", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [{ id: "t1", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null }],
          timetables: [{ id: "tt1", validFrom: "2026-01-01", validTo: null }],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            // Paragem 1 não é timepoint nem tem stopTimes; paragem 2 é o ponto de controle
            stops: [
              { position: 1, stopId: "s1", isTimepoint: false },
              { position: 2, stopId: "s2", isTimepoint: true },
            ],
          },
        ],
        trips: [
          {
            id: "t1",
            patternId: "p1",
            firstPosition: 2,
            lastPosition: 2,
            stopTimes: [
              { position: 2, serviceMinute: 500, origin: "official" as const }, // 08:20
            ],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s1", "Paragem Comum"], ["s2", "Ponto de Controle"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      // A paragem escolhida deve ser a posição 2 (primeiro ponto de controle), com o horário 08:20
      expect(res.position).toBe(2);
      expect(res.stopName).toBe("Ponto de Controle");
      expect(res.times).toEqual(["08:20"]);
    });

    it("partialCount conta apenas as viagens que não passam pelo ponto de controle", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [
            { id: "t-full", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
            { id: "t-partial", timetableId: "tt1", dayTypes: ["weekday"], seasonId: null },
          ],
          timetables: [{ id: "tt1", validFrom: "2026-01-01", validTo: null }],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            stops: [
              { position: 1, stopId: "s1", isTimepoint: true }, // ponto de controle
              { position: 2, stopId: "s2", isTimepoint: false },
            ],
          },
        ],
        trips: [
          // Passa pelo ponto de controle (posição 1)
          {
            id: "t-full",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 2,
            stopTimes: [
              { position: 1, serviceMinute: 500, origin: "official" as const },
              { position: 2, serviceMinute: 520, origin: "official" as const },
            ],
          },
          // Começa na posição 2 e não passa pelo ponto de controle (posição 1)
          {
            id: "t-partial",
            patternId: "p1",
            firstPosition: 2,
            lastPosition: 2,
            stopTimes: [
              { position: 2, serviceMinute: 540, origin: "official" as const },
            ],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s1", "Terminal"], ["s2", "Meio"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(res.position).toBe(1);
      expect(res.times).toEqual(["08:20"]);
      expect(res.partialCount).toBe(1);
    });

    it("0.8: tabela de outro percurso não entra nos horários-base", () => {
      const snapshot: ScheduleSnapshot = {
        calendar: { overrides: [], holidays: [], includeMunicipal: true },
        schedule: {
          trips: [
            { id: "t1", timetableId: "tt-p1", dayTypes: ["weekday"], seasonId: null },
            { id: "t-other", timetableId: "tt-other", dayTypes: ["weekday"], seasonId: null },
          ],
          timetables: [
            { id: "tt-p1", validFrom: "2026-01-01", validTo: null },
            { id: "tt-other", validFrom: "2026-09-01", validTo: null },
          ],
          seasons: [],
        },
        patterns: [
          {
            id: "p1",
            stops: [{ position: 1, stopId: "s1", isTimepoint: true }],
          },
          {
            id: "p2",
            stops: [{ position: 1, stopId: "s2", isTimepoint: true }],
          },
        ],
        trips: [
          {
            id: "t1",
            patternId: "p1",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 500, origin: "official" as const }],
          },
          {
            id: "t-other",
            patternId: "p2",
            firstPosition: 1,
            lastPosition: 1,
            stopTimes: [{ position: 1, serviceMinute: 600, origin: "official" as const }],
          },
        ],
        patternLine: new Map(),
        patternLineId: new Map(),
        lineInfo: new Map(),
        patternStopIds: new Map(),
        patternStopById: new Map(),
        stopNames: new Map([["s1", "Terminal P1"], ["s2", "Terminal P2"]]),
      };

      const res = baseTimes({
        snapshot,
        patternId: "p1",
        dayType: "weekday",
        todayLisbon: "2026-10-08",
      });

      expect(res.validFrom).toBe("2026-01-01");
      expect(res.times).toEqual(["08:20"]);
    });
  });
});
