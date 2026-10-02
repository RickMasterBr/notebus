import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeed, duplicateKeys, serialize, type Expected, type SeedInput } from "./build.ts";
import type { SeedFile } from "./types.ts";
import { checkIds, checkReferences } from "./validate.ts";

// Exemplo inventado (D-091): 2 linhas, 3 percursos, 4 quadros, 12 linhas de tabela, 7 viagens.
const dir = join(import.meta.dirname, "..", "fixtures");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const EXPECTED: Expected = { lines: 2, patterns: 3, tables: 4, rows: 12, trips: 7 };

function input(): SeedInput {
  return {
    markdown: read("exemplo.md"),
    timepoints: JSON.parse(read("timepoints.json")),
    stopsMap: JSON.parse(read("stops-map.json")),
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    colors: { "1": "#111111", "2": "#222222" },
  };
}

const build = (i: SeedInput = input()) => buildSeed(i, EXPECTED);
const V = "mobilis/2026-09-01";
const keyed = <T extends { key: string }>(list: T[], key: string) => list.find((x) => x.key === key);

describe("buildSeed com o exemplo inventado", () => {
  it("monta sem erro e com as contagens esperadas", () => {
    const { seed, errors, report } = build();
    expect(errors).toEqual([]);
    expect(report.tables).toBe(4);
    expect(report.rows).toBe(12);
    expect(seed.trips).toHaveLength(7);
    expect(seed.patternStops).toHaveLength(11);
    // 11 posições; o stops-map junta 3 em 9001 e 2 na Rua Beta → 8 pontos.
    expect(seed.stops).toHaveLength(8);
  });

  it("gera uma chave de cada tipo, como aprovado no CONFERIR.md parte 4", () => {
    const { seed } = build();
    expect(keyed(seed.stops, "mobilis/stop/9001")?.externalId).toBe("9001");
    expect(keyed(seed.stops, "mobilis/stop/L2-s1/2")?.name).toBe("Rua Épsilon");
    // Ponto sem ID juntado pelo stops-map: chave da primeira aparição.
    expect(keyed(seed.stops, "mobilis/stop/L1/2")?.externalId).toBeNull();
    expect(keyed(seed.stops, "mobilis/stop/L1/3")).toBeUndefined();
    expect(keyed(seed.lines, "mobilis/line/1")?.id).toBe("c52dcde6-798d-508d-8f1a-0497bc14d560");
    expect(keyed(seed.patterns, `${V}/pattern/L2-s1`)?.isCircular).toBe(false);
    expect(keyed(seed.patternStops, `${V}/pattern/L1/pos/4`)?.timepointLabel).toBe("Largo Gama");
    expect(keyed(seed.timetables, `${V}/timetable/L1`)?.validFrom).toBe("2026-09-01");
    expect(keyed(seed.trips, `${V}/trip/L1/util/2230-p1`)?.dayTypes).toEqual(["weekday"]);
    expect(keyed(seed.trips, `${V}/trip/L2-s2/sab-dom-fer/0900-p1`)?.dayTypes).toEqual(["saturday", "sunday_holiday"]);
    expect(keyed(seed.stopTimes, `${V}/trip/L1/util/2230-p1/pos/5`)?.serviceMinute).toBe(22 * 60 + 55);
  });

  it("chaves e IDs não se repetem, e cada ID é o UUIDv5 da chave", () => {
    const { seed } = build();
    expect(duplicateKeys(seed)).toEqual([]);
    const all = [seed.stops, seed.lines, seed.patterns, seed.patternStops, seed.timetables, seed.trips, seed.stopTimes].flat();
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(checkIds(seed)).toEqual([]);
    const tampered = structuredClone(seed);
    tampered.lines[0]!.id = tampered.lines[1]!.id;
    expect(checkIds(tampered)).toHaveLength(1);
  });

  it("mesma entrada gera o mesmo arquivo, byte a byte (V8)", () => {
    const a = serialize(build().seed);
    const b = serialize(build().seed);
    expect(b).toBe(a);
  });

  it("depois da meia-noite vira minuto de serviço acima de 1440 (D-016)", () => {
    const { seed } = build();
    expect(keyed(seed.stopTimes, `${V}/trip/L1/util/2340-p1/pos/5`)?.serviceMinute).toBe(1445);
    const madrugada = keyed(seed.trips, `${V}/trip/L1/util/2450-p1`);
    expect(madrugada).toMatchObject({ firstPosition: 1, lastPosition: 4 });
  });

  it("viagem parcial começa onde tem o primeiro horário", () => {
    const { seed } = build();
    expect(keyed(seed.trips, `${V}/trip/L2-s1/util/0805-p2`)).toMatchObject({ firstPosition: 2, lastPosition: 3 });
  });

  it("'não se realiza em Julho e Agosto' vale só para o quadro em que aparece", () => {
    const { seed } = build();
    const season = (key: string) => keyed(seed.trips, key)?.season;
    expect(season(`${V}/trip/L2-s1/util/0700-p1`)).toEqual({ startMd: "07-01", endMd: "08-31", mode: "exclude" });
    expect(season(`${V}/trip/L2-s2/sab-dom-fer/0900-p1`)).toBeNull();
    expect(season(`${V}/trip/L1/util/2230-p1`)).toBeNull();
  });

  it("linha 'sem_mapear' fica fora do arquivo e entra no relatório", () => {
    const { seed, report } = build();
    expect(report.unmappedRows).toEqual([{ table: 4, pattern: "L2-s2", row: 2, name: "Zeta" }]);
    expect(report.droppedTimes).toBe(1);
    expect(keyed(seed.stopTimes, `${V}/trip/L2-s2/sab-dom-fer/0900-p1/pos/2`)).toBeUndefined();
    expect(keyed(seed.patternStops, `${V}/pattern/L2-s2/pos/2`)?.isTimepoint).toBe(false);
  });
});

describe("referências soltas (D-122)", () => {
  it("nenhuma no arquivo gerado", () => {
    expect(checkReferences(build().seed)).toEqual([]);
  });

  it("detecta cada tipo de referência quebrada de propósito", () => {
    const broken = (f: (s: SeedFile) => void) => {
      const s = structuredClone(build().seed);
      f(s);
      return checkReferences(s);
    };
    expect(broken((s) => (s.patterns[0]!.lineId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.patternStops[0]!.stopId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.patternStops[0]!.patternId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.timetables[0]!.patternId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.trips[0]!.timetableId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.stopTimes[0]!.tripId = "x"))).toHaveLength(1);
    expect(broken((s) => (s.stopTimes[0]!.patternStopId = "x"))).toHaveLength(1);
    // Apagar a paragem deixa solta a paragem de percurso que apontava para ela.
    expect(broken((s) => s.stops.splice(0, 1)).length).toBeGreaterThan(0);
  });
});

describe("validação reprova entrada quebrada", () => {
  const errorsWith = (f: (i: SeedInput) => void, expected: Expected = EXPECTED) => {
    const i = input();
    f(i);
    return buildSeed(i, expected).errors;
  };
  const tp = (i: SeedInput) => i.timepoints.percursos["L1"]!.tabelas[0]!.linhas;

  it("V1: linha com uma coluna a menos", () => {
    const errs = errorsWith((i) => (i.markdown = i.markdown.replace("| **Largo Gama** | 22:45 | 23:55 | 01:05 |", "| **Largo Gama** | 22:45 | 23:55 |")));
    expect(errs.some((e) => e.startsWith("V1:"))).toBe(true);
  });

  it("V2: horário que volta no tempo", () => {
    const errs = errorsWith((i) => (i.markdown = i.markdown.replace("| **Largo Gama** | 08:10 |", "| **Largo Gama** | 07:50 |")));
    expect(errs.some((e) => e.startsWith("V2:"))).toBe(true);
  });

  it("V3: itinerário com posição pulada", () => {
    const errs = errorsWith((i) => (i.markdown = i.markdown.replace("4. Largo Gama", "6. Largo Gama")));
    expect(errs.some((e) => e.startsWith("V3:"))).toBe(true);
  });

  it("V4: posição quebrada de propósito no timepoints.json (A2)", () => {
    const errs = errorsWith((i) => {
      const row = tp(i)[1]!;
      if (row.status === "alta") row.posicao = 1;
    });
    expect(errs.some((e) => e.startsWith("V4:"))).toBe(true);
  });

  it("V4: linha ainda em dúvida", () => {
    const errs = errorsWith((i) => (tp(i)[1] = { linha_tabela: 2, nome_tabela: "Largo Gama", status: "duvida" }));
    expect(errs.some((e) => e.includes("em dúvida"))).toBe(true);
  });

  it("V4: nome do itinerário que não bate com a posição", () => {
    const errs = errorsWith((i) => {
      const row = tp(i)[1]!;
      if (row.status === "alta") row.nome_itinerario = "Rua Beta";
    });
    expect(errs.some((e) => e.startsWith("V4:"))).toBe(true);
  });

  it("V5: ponto numa posição que não existe, ou duas vezes na mesma posição", () => {
    expect(errorsWith((i) => (i.stopsMap.pontos[0]!.posicoes[0]!.posicao = 99)).some((e) => e.startsWith("V5:"))).toBe(true);
    expect(errorsWith((i) => i.stopsMap.pontos[2]!.posicoes.push({ percurso: "L1", posicao: 1 })).some((e) => e.startsWith("V5:"))).toBe(true);
  });

  it("V7: contagem diferente da esperada", () => {
    const errs = errorsWith(() => {}, { ...EXPECTED, trips: 8 });
    expect(errs).toEqual(["V7: trips: 7, esperado 8"]);
  });
});
