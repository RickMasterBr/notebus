import { describe, expect, it } from "vitest";
import { officialId } from "@notebus/domain/src/ids.ts";
import { parseSeedFile } from "@notebus/domain/src/seedFormat.ts";
import { serialize } from "../build.ts";
import { generateSeed } from "./generate.ts";
import type { GenerateResult, GtfsFeed, NetworkConfig } from "./types.ts";

const CUT = "2026-11-01";
const WEEK = ["1", "1", "1", "1", "1", "0", "0"];
type Row = [stop: string, time: string, control?: boolean];

const rows = (t0: string, t1: string, t2: string, stops: string[] = ["s1", "s2", "s3", "s4", "s5"]): Row[] => {
  const ctl = new Set([0, 2, stops.length - 1]);
  const mid = [t0, "00:00:00", t1, "00:00:00", t2];
  return stops.map((s, i) => [s, i === 0 ? t0 : i === stops.length - 1 ? t2 : mid[i] ?? t1, ctl.has(i)] as Row);
};

function feed(over: Partial<GtfsFeed> = {}, trips?: Record<string, { servico: string; rota?: string; rows: Row[] }>): GtfsFeed {
  const all = trips ?? {
    t1: { servico: "A-U", rows: rows("08:00:00", "08:10:00", "08:20:00") },
    t2: { servico: "XJA1-U", rows: rows("09:00:00", "09:10:00", "09:20:00") },
    t3: { servico: "JA-U", rows: rows("10:00:00", "10:10:00", "10:20:00", ["s1", "s2", "s4", "s5"]) },
  };
  return {
    info: { versao: "t", inicio: "20260101", fim: "20270131" },
    rotas: [{ id: "R1", nomeCurto: "1" }, { id: "R9", nomeCurto: "9" }],
    viagens: Object.entries(all).map(([id, t]) => ({ id, rota: t.rota ?? "R1", servico: t.servico, direcao: "0" })),
    horarios: Object.entries(all).flatMap(([viagem, t]) =>
      t.rows.map(([parada, hora, controle], i) => ({ viagem, parada, sequencia: i + 1, hora, controle: controle ?? false })),
    ),
    paradas: ["s1", "s2", "s3", "s4", "s5", "s9"].map((id, i) => ({ id, codigo: `G${i + 1}`, nome: `Parada ${id}`, lat: 39.7 + i / 100, lon: -8.8 - i / 100 })),
    calendario: ["A-U", "XJA1-U", "JA-U"].map((servico) => ({ servico, dias: WEEK, inicio: "20260101", fim: "20270131" })),
    excecoes: [{ servico: "A-U", data: "20261118", tipo: "2" }],
    ...over,
  };
}

const config = (over: Partial<NetworkConfig> = {}): NetworkConfig => ({
  network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
  datasetName: "exemplo",
  lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
  patterns: [{ routeId: "R1", code: "L1-s1", line: "1", label: "Ida", isCircular: false }],
  stops: [{ stopId: "s1", key: "mobilis/stop/EXT1", name: "Praça", aliases: ["Pr."], externalId: "EXT1" }],
  holidays: [{ id: officialId("mobilis/holiday/2026-11-20"), key: "mobilis/holiday/2026-11-20", date: "2026-11-20", name: "Municipal inventado", scope: "municipal" }],
  ...over,
});

function ok(r: GenerateResult) {
  if (!r.ok) throw new Error(r.errors.map((e) => `${e.code} ${e.items.join(",")}`).join("; "));
  return r;
}
const codes = (r: GenerateResult) => (r.ok ? [] : r.errors.map((e) => e.code));

describe("generateSeed: saída válida", () => {
  const { seed, warnings } = ok(generateSeed(feed(), config(), CUT));

  it("passa parseSeedFile e é do formato 2, com vigência = corte", () => {
    expect(parseSeedFile(JSON.parse(serialize(seed))).formatVersion).toBe(2);
    expect(seed.dataset).toEqual({ name: "exemplo", version: CUT });
    expect(seed.timetables.map((t) => t.validFrom)).toEqual([CUT]);
    expect(seed.holidays).toHaveLength(1);
  });

  it("chaves e IDs no esquema da v0 com a vigência do corte", () => {
    const tripKey = `mobilis/${CUT}/trip/L1-s1/util/0800-p1`;
    expect(seed.lines[0]!.key).toBe("mobilis/line/1");
    expect(seed.patterns[0]!.key).toBe(`mobilis/${CUT}/pattern/L1-s1`);
    expect(seed.patterns[0]!.lineId).toBe(officialId("mobilis/line/1"));
    expect(seed.timetables[0]!.key).toBe(`mobilis/${CUT}/timetable/L1-s1`);
    expect(seed.patternStops[0]!.key).toBe(`mobilis/${CUT}/pattern/L1-s1/pos/1`);
    expect(seed.trips.map((t) => t.key)).toContain(tripKey);
    expect(seed.trips.find((t) => t.key === tripKey)!.id).toBe(officialId(tripKey));
    expect(seed.stopTimes.map((t) => t.key)).toContain(`${tripKey}/pos/1`);
    expect(seed.stopTimes[0]!.patternStopId).toBe(officialId(`mobilis/${CUT}/pattern/L1-s1/pos/1`));
  });

  it("época: XJA1-U exclude, JA-U include, A-U sem época; sourceTable 0", () => {
    const by = (hhmm: string) => seed.trips.find((t) => t.key.endsWith(`/${hhmm}-p1`))!;
    expect(by("0900").season).toEqual({ startMd: "07-01", endMd: "08-31", mode: "exclude" });
    expect(by("1000").season).toEqual({ startMd: "07-01", endMd: "08-31", mode: "include" });
    expect(by("0800").season).toBeNull();
    expect(seed.trips.every((t) => t.sourceTable === 0 && t.dayTypes[0] === "weekday")).toBe(true);
  });

  it("notOn e alsoOn do serviço vão para as suas viagens", () => {
    const a = seed.trips.find((t) => t.key.endsWith("/0800-p1"))!;
    expect(a.notOn).toEqual(["2026-11-18"]);
    expect(a.alsoOn).toContain("2026-12-25");
    const x = seed.trips.find((t) => t.key.endsWith("/0900-p1"))!;
    expect(x.notOn).toBeUndefined();
  });

  it("lat/lon só nos pontos usados; ponto da tabela mantém key, nome e externalId", () => {
    expect(seed.stops).toHaveLength(5);
    expect(seed.stops.every((s) => typeof s.lat === "number" && typeof s.lon === "number")).toBe(true);
    const praca = seed.stops.find((s) => s.key === "mobilis/stop/EXT1")!;
    expect(praca).toMatchObject({ name: "Praça", aliases: ["Pr."], externalId: "EXT1", lat: 39.7, lon: -8.8 });
  });

  it("ponto fora da tabela com stop_code único vira mobilis/stop/<stop_code>", () => {
    const s = seed.stops.find((x) => x.key === "mobilis/stop/G2")!;
    expect(s).toMatchObject({ id: officialId("mobilis/stop/G2"), name: "Parada s2", externalId: null });
  });

  it("controle: isTimepoint onde alguma viagem tem, rótulo = nome do ponto; só controle em stopTimes", () => {
    expect(seed.patternStops.map((p) => p.isTimepoint)).toEqual([true, false, true, true, true]);
    expect(seed.patternStops[0]!.timepointLabel).toBe("Praça");
    expect(seed.patternStops[1]!.timepointLabel).toBeNull();
    expect(seed.stopTimes).toHaveLength(9);
  });

  it("viagem que pula paragem entra e gera PARADAS_PULADAS; rota do feed sem configuração gera ROTA_IGNORADA", () => {
    const skipped = seed.trips.find((t) => t.key.endsWith("/1000-p1"))!;
    expect([skipped.firstPosition, skipped.lastPosition]).toEqual([1, 5]);
    expect(warnings.find((w) => w.code === "PARADAS_PULADAS")!.items).toEqual(["R1: 1"]);
    expect(warnings.find((w) => w.code === "ROTA_IGNORADA")!.items).toEqual(["R9"]);
  });

  it("hora depois da meia-noite: chave com 2541 e minuto 1541", () => {
    const late = feed({}, { t1: { servico: "A-U", rows: rows("25:41:00", "25:50:00", "26:00:00") } });
    const out = ok(generateSeed(late, config(), CUT)).seed;
    expect(out.trips[0]!.key).toBe(`mobilis/${CUT}/trip/L1-s1/util/2541-p1`);
    expect(out.stopTimes[0]!.serviceMinute).toBe(1541);
  });

  it("a mesma entrada dá o mesmo arquivo, byte a byte", () => {
    expect(serialize(ok(generateSeed(feed(), config(), CUT)).seed)).toBe(serialize(seed));
  });
});

describe("generateSeed: erros", () => {
  it("ponto fora da tabela com código vazio ou repetido → PARADA_SEM_EQUIVALENCIA", () => {
    const base = feed();
    const empty = feed({ paradas: base.paradas.map((p) => (p.id === "s3" ? { ...p, codigo: "" } : p)) });
    const dup = feed({ paradas: base.paradas.map((p) => (p.id === "s4" ? { ...p, codigo: "G2" } : p)) });
    for (const f of [empty, dup]) {
      const r = generateSeed(f, config(), CUT);
      expect(codes(r)).toEqual(["PARADA_SEM_EQUIVALENCIA"]);
    }
    const r = generateSeed(dup, config(), CUT);
    expect(!r.ok && r.errors[0]!.items.sort()).toEqual(["s2 (código repetido G2)", "s4 (código repetido G2)"]);
  });

  it("código vazio ou repetido de ponto que está na tabela não é erro", () => {
    const base = feed();
    const f = feed({ paradas: base.paradas.map((p) => (p.id === "s1" ? { ...p, codigo: "" } : p)) });
    expect(generateSeed(f, config(), CUT).ok).toBe(true);
  });

  it("parada do horário que não existe em stops → PARADA_INEXISTENTE", () => {
    const f = feed({ paradas: feed().paradas.filter((p) => p.id !== "s3") });
    expect(codes(generateSeed(f, config(), CUT))).toEqual(["PARADA_INEXISTENTE"]);
  });

  it("percurso da configuração sem rota no feed → ROTA_AUSENTE", () => {
    const cfg = config({ patterns: [...config().patterns, { routeId: "R7", code: "L1-s2", line: "1", label: "Volta", isCircular: false }] });
    const r = generateSeed(feed(), cfg, CUT);
    expect(codes(r)).toEqual(["ROTA_AUSENTE"]);
    expect(!r.ok && r.errors[0]!.items).toEqual(["L1-s2: R7"]);
  });

  it("corte depois do fim do feed → CORTE_FORA_DO_FEED; fim vem do calendar sem info", () => {
    expect(codes(generateSeed(feed(), config(), "2027-02-01"))).toEqual(["CORTE_FORA_DO_FEED"]);
    expect(codes(generateSeed(feed({ info: null }), config(), "2027-02-01"))).toEqual(["CORTE_FORA_DO_FEED"]);
    expect(generateSeed(feed(), config(), "2027-01-31").ok).toBe(true);
  });

  it("corte que não é data real → CORTE_INVALIDO", () => {
    for (const c of ["2026-02-30", "01/11/2026", ""]) expect(codes(generateSeed(feed(), config(), c))).toEqual(["CORTE_INVALIDO"]);
  });

  it("service_id fora da tabela → SERVICO_DESCONHECIDO", () => {
    const f = feed({}, { t1: { servico: "Z-U", rows: rows("08:00:00", "08:10:00", "08:20:00") } });
    const r = generateSeed(f, config(), CUT);
    expect(codes(r)).toEqual(["SERVICO_DESCONHECIDO"]);
    expect(!r.ok && r.errors[0]!.items).toEqual(["Z-U"]);
  });

  it("dois itens com a mesma chave → CHAVE_DUPLICADA (sem renomear)", () => {
    const f = feed({}, {
      t1: { servico: "A-U", rows: rows("08:00:00", "08:10:00", "08:20:00") },
      t2: { servico: "AX2431-U", rows: rows("08:00:00", "08:11:00", "08:21:00") },
    });
    const r = generateSeed(f, config(), CUT);
    expect(codes(r)).toEqual(["CHAVE_DUPLICADA"]);
    expect(!r.ok && r.errors[0]!.items[0]).toBe(`mobilis/${CUT}/trip/L1-s1/util/0800-p1`);
  });

  it("horário que volta no tempo → INVARIANTE_HORARIO", () => {
    const f = feed({}, { t1: { servico: "A-U", rows: rows("08:00:00", "08:10:00", "07:50:00") } });
    expect(codes(generateSeed(f, config(), CUT))).toEqual(["INVARIANTE_HORARIO"]);
  });

  it("linha da configuração faltando → LINHA_AUSENTE; feriado repetido → FERIADO_INVALIDO", () => {
    expect(codes(generateSeed(feed(), config({ lines: [] }), CUT))).toEqual(["LINHA_AUSENTE"]);
    const h = config().holidays[0]!;
    expect(codes(generateSeed(feed(), config({ holidays: [h, { ...h, key: "mobilis/holiday/x" }] }), CUT))).toContain("FERIADO_INVALIDO");
  });
});
