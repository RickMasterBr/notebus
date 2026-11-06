import { describe, expect, it } from "vitest";
import type { PatternData } from "@notebus/domain";
import type { OptionRow } from "./gotoData";
import type { ScheduleSnapshot } from "./schedule";
import { unresolvedBusOptionIds } from "./gotoUnresolved";

function createMockSchedule(overrides?: Partial<ScheduleSnapshot>): ScheduleSnapshot {
  return {
    calendar: { holidays: [], overrides: [] },
    schedule: {
      timetables: [],
      trips: [],
      seasons: [],
    },
    patterns: [],
    trips: [],
    patternLine: new Map(),
    patternLineId: new Map(),
    lineInfo: new Map(),
    patternStopIds: new Map(),
    patternStopById: new Map(),
    stopNames: new Map(),
    ...overrides,
  };
}

function createMockOption(overrides?: Partial<OptionRow>): OptionRow {
  return {
    id: "opt-1",
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    source: "user",
    routeId: "route-1",
    kind: "bus",
    boardPatternStopId: "ps-board",
    alightPatternStopId: "ps-alight",
    walkMinutes: null,
    sort: 1,
    ...overrides,
  };
}

describe("unresolvedBusOptionIds (C1, C2, ideia 242)", () => {
  const serviceDate = "2026-11-05";

  it("devolve lista vazia quando todas as opções resolvem", () => {
    const pattern: PatternData = {
      id: "pat-1",
      stops: [
        { position: 1, stopId: "stop-1", isTimepoint: true },
        { position: 2, stopId: "stop-2", isTimepoint: true },
      ],
    };

    const schedule = createMockSchedule({
      patterns: [pattern],
      patternStopById: new Map([
        ["ps-board", { patternId: "pat-1", position: 1, stopId: "stop-1" }],
        ["ps-alight", { patternId: "pat-1", position: 2, stopId: "stop-2" }],
      ]),
    });

    const options: OptionRow[] = [createMockOption()];

    const result = unresolvedBusOptionIds(options, "route-1", schedule, serviceDate);
    expect(result).toEqual([]);
  });

  it("identifica opção quando ponto de embarque ou de descida está ausente do horário", () => {
    const pattern: PatternData = {
      id: "pat-1",
      stops: [{ position: 1, stopId: "stop-1", isTimepoint: true }],
    };

    // ps-alight não está no patternStopById
    const scheduleBoardOnly = createMockSchedule({
      patterns: [pattern],
      patternStopById: new Map([
        ["ps-board", { patternId: "pat-1", position: 1, stopId: "stop-1" }],
      ]),
    });

    // ps-board não está no patternStopById
    const scheduleAlightOnly = createMockSchedule({
      patterns: [pattern],
      patternStopById: new Map([
        ["ps-alight", { patternId: "pat-1", position: 2, stopId: "stop-2" }],
      ]),
    });

    const opt = createMockOption({ id: "opt-missing-stop" });

    expect(unresolvedBusOptionIds([opt], "route-1", scheduleBoardOnly, serviceDate)).toEqual([
      "opt-missing-stop",
    ]);
    expect(unresolvedBusOptionIds([opt], "route-1", scheduleAlightOnly, serviceDate)).toEqual([
      "opt-missing-stop",
    ]);
  });

  it("identifica opção quando o percurso não está em vigor no dia", () => {
    // patternId no patternStopById não existe na lista de patterns (patternInForceOn retorna undefined)
    const schedule = createMockSchedule({
      patterns: [],
      patternStopById: new Map([
        ["ps-board", { patternId: "pat-missing", position: 1, stopId: "stop-1" }],
        ["ps-alight", { patternId: "pat-missing", position: 2, stopId: "stop-2" }],
      ]),
    });

    const opt = createMockOption({ id: "opt-missing-pattern" });

    expect(unresolvedBusOptionIds([opt], "route-1", schedule, serviceDate)).toEqual([
      "opt-missing-pattern",
    ]);
  });

  it("identifica opção quando a posição não se traduz no percurso em vigor", () => {
    // Percurso antigo no qual a opção foi gravada
    const patOld: PatternData = {
      id: "pat-old",
      family: "fam-line1",
      stops: [
        { position: 1, stopId: "stop-1", isTimepoint: true },
        { position: 2, stopId: "stop-2", isTimepoint: true },
      ],
    };

    // Percurso novo da mesma família em vigor, onde o ponto stop-1 foi removido
    const patNew: PatternData = {
      id: "pat-new",
      family: "fam-line1",
      stops: [
        { position: 1, stopId: "stop-3", isTimepoint: true },
        { position: 2, stopId: "stop-2", isTimepoint: true },
      ],
    };

    const patternQuadros = new Map([
      ["pat-old", [{ validFrom: "2026-09-01", validTo: "2026-10-31" }]],
      ["pat-new", [{ validFrom: "2026-11-01", validTo: null }]],
    ]);

    const schedule = createMockSchedule({
      patterns: [patOld, patNew],
      patternQuadros,
      patternStopById: new Map([
        ["ps-board", { patternId: "pat-old", position: 1, stopId: "stop-1" }],
        ["ps-alight", { patternId: "pat-old", position: 2, stopId: "stop-2" }],
      ]),
    });

    const opt = createMockOption({ id: "opt-no-translate" });

    expect(unresolvedBusOptionIds([opt], "route-1", schedule, "2026-11-05")).toEqual([
      "opt-no-translate",
    ]);
  });

  it("não conta opção com embarque e descida em percursos diferentes (erro de cadastro)", () => {
    const pattern1: PatternData = {
      id: "pat-1",
      stops: [{ position: 1, stopId: "stop-1", isTimepoint: true }],
    };
    const pattern2: PatternData = {
      id: "pat-2",
      stops: [{ position: 2, stopId: "stop-2", isTimepoint: true }],
    };

    const schedule = createMockSchedule({
      patterns: [pattern1, pattern2],
      patternStopById: new Map([
        ["ps-board", { patternId: "pat-1", position: 1, stopId: "stop-1" }],
        ["ps-alight", { patternId: "pat-2", position: 2, stopId: "stop-2" }],
      ]),
    });

    const opt = createMockOption({ id: "opt-different-patterns" });

    expect(unresolvedBusOptionIds([opt], "route-1", schedule, serviceDate)).toEqual([]);
  });

  it("ignora opção a pé", () => {
    const schedule = createMockSchedule();
    const optWalk = createMockOption({
      id: "opt-walk",
      kind: "walk",
      walkMinutes: 10,
      boardPatternStopId: null,
      alightPatternStopId: null,
    });

    expect(unresolvedBusOptionIds([optWalk], "route-1", schedule, serviceDate)).toEqual([]);
  });

  it("ignora opção apagada (deletedAt !== null)", () => {
    const schedule = createMockSchedule();
    const optDeleted = createMockOption({
      id: "opt-deleted",
      deletedAt: 12345,
    });

    expect(unresolvedBusOptionIds([optDeleted], "route-1", schedule, serviceDate)).toEqual([]);
  });

  it("ignora opção de outro trajeto", () => {
    const schedule = createMockSchedule();
    const optOtherRoute = createMockOption({
      id: "opt-other",
      routeId: "other-route",
    });

    expect(unresolvedBusOptionIds([optOtherRoute], "route-1", schedule, serviceDate)).toEqual([]);
  });

  it("ignora opção sem embarque ou sem descida gravados", () => {
    const schedule = createMockSchedule();
    const optNoBoard = createMockOption({
      id: "opt-no-board",
      boardPatternStopId: null,
      alightPatternStopId: "ps-alight",
    });
    const optNoAlight = createMockOption({
      id: "opt-no-alight",
      boardPatternStopId: "ps-board",
      alightPatternStopId: null,
    });

    expect(
      unresolvedBusOptionIds([optNoBoard, optNoAlight], "route-1", schedule, serviceDate),
    ).toEqual([]);
  });

  it("devolve os ids na ordem de sort das opções", () => {
    const schedule = createMockSchedule(); // sem patternStopById, todas bus com embarque e descida serão não resolvidas

    const opt1 = createMockOption({ id: "opt-second", sort: 20 });
    const opt2 = createMockOption({ id: "opt-first", sort: 10 });
    const opt3 = createMockOption({ id: "opt-third", sort: 30 });

    expect(
      unresolvedBusOptionIds([opt1, opt2, opt3], "route-1", schedule, serviceDate),
    ).toEqual(["opt-first", "opt-second", "opt-third"]);
  });
});
