import { describe, expect, it } from "vitest";
import { officialId } from "@notebus/domain/src/ids.ts";
import { checkReferences, formatReferences, type BackupTables } from "./referencias.ts";
import type { SeedFile } from "./types.ts";

// Tudo inventado (D-091): rede, pontos, percursos e backup. Os nomes dos pontos NÃO podem sair no relatório.
interface Spec {
  code: string;
  v: string; // versão da chave: mesma versão nos dois arquivos = mesmo id (percurso mantido)
  stops: string[];
  starts: number[];
  circular?: boolean;
}

const k = (key: string) => ({ id: officialId(key), key });
const pk = (v: string, code: string) => `mobilis/${v}/pattern/${code}`;
const psId = (v: string, code: string, pos: number) => officialId(`${pk(v, code)}/pos/${pos}`);
const ttId = (v: string, code: string) => officialId(`mobilis/${v}/timetable/${code}`);
const tripId = (v: string, code: string, start: number) => officialId(`mobilis/${v}/trip/${code}/${start}`);

function seedOf(ver: string, specs: Spec[]): SeedFile {
  const seed: SeedFile = {
    format: "notebus.mobilis-seed",
    formatVersion: 2,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    dataset: { name: "exemplo", version: ver },
    stops: [],
    lines: [{ ...k("mobilis/line/1"), code: "1", name: "Linha Um", color: "#111111" }],
    patterns: [],
    patternStops: [],
    timetables: [],
    trips: [],
    stopTimes: [],
  };
  for (const s of specs) {
    for (const st of s.stops) {
      if (!seed.stops.some((x) => x.key === `mobilis/stop/${st}`)) seed.stops.push({ ...k(`mobilis/stop/${st}`), name: `Nome Secreto ${st}`, aliases: [], externalId: null });
    }
    const pattern = { ...k(pk(s.v, s.code)), code: s.code, lineId: officialId("mobilis/line/1"), label: "Ida", isCircular: !!s.circular };
    seed.patterns.push(pattern);
    seed.timetables.push({ ...k(`mobilis/${s.v}/timetable/${s.code}`), patternId: pattern.id, validFrom: ver, validTo: null });
    const last = s.stops.length;
    s.stops.forEach((st, i) => {
      const tp = i + 1 === 1 || i + 1 === last;
      seed.patternStops.push({ ...k(`${pk(s.v, s.code)}/pos/${i + 1}`), patternId: pattern.id, position: i + 1, stopId: officialId(`mobilis/stop/${st}`), isTimepoint: tp, timepointLabel: tp ? "T" : null });
    });
    for (const start of s.starts) {
      const key = `mobilis/${s.v}/trip/${s.code}/${start}`;
      seed.trips.push({ ...k(key), timetableId: ttId(s.v, s.code), firstPosition: 1, lastPosition: last, dayTypes: ["weekday"], season: null, sourceTable: 0 });
      for (const pos of [1, last]) seed.stopTimes.push({ ...k(`${key}/pos/${pos}`), tripId: tripId(s.v, s.code, start), patternStopId: psId(s.v, s.code, pos), serviceMinute: start + 10 * (pos - 1) });
    }
  }
  return seed;
}

// anterior: LA circular X,Y,Z,X · LB A,B,C · LC A,Q,C · LD A,B · LE X,Y,X
const anterior = seedOf("1", [
  { code: "LA", v: "1", stops: ["X", "Y", "Z", "X"], starts: [600, 660], circular: true },
  { code: "LB", v: "0", stops: ["A", "B", "C"], starts: [700] },
  { code: "LC", v: "1", stops: ["A", "Q", "C"], starts: [800] },
  { code: "LD", v: "1", stops: ["A", "B"], starts: [900] },
  { code: "LE", v: "1", stops: ["X", "Y", "X"], starts: [500] },
]);
// novo: LA com ids novos e uma paragem a mais no começo · LB igual · LC sem Q · LE sem a 2ª passagem de X · sem LD
const novo = seedOf("2", [
  { code: "LA", v: "2", stops: ["W", "X", "Y", "Z", "X"], starts: [600, 660], circular: true },
  { code: "LB", v: "0", stops: ["A", "B", "C"], starts: [700] },
  { code: "LC", v: "2", stops: ["A", "C", "D"], starts: [800] },
  { code: "LE", v: "2", stops: ["X", "Y", "Z"], starts: [500] },
]);

const opt = (id: string, board: string, alight: string, extra: Row = {}): Row => ({ id, kind: "bus", board_pattern_stop_id: board, alight_pattern_stop_id: alight, deleted_at: null, ...extra });
type Row = Record<string, unknown>;
const alarm = (id: string, optionId: string, anchor: number, extra: Row = {}): Row => ({
  id,
  option_id: optionId,
  anchor_trip_id: "t",
  anchor_base_minute: anchor,
  weekdays: [1, 2],
  once_date: null,
  valid_from: "2026-09-01",
  valid_to: null,
  enabled: 1,
  deleted_at: null,
  ...extra,
});

function backup(): BackupTables {
  return {
    option: [
      opt("o1", psId("0", "LB", 1), psId("0", "LB", 3)),
      opt("o2", psId("1", "LA", 1), psId("1", "LA", 4)),
      opt("o3", psId("1", "LC", 2), psId("1", "LC", 3)),
      opt("o4", psId("1", "LD", 1), psId("1", "LD", 2)),
      opt("o5", psId("1", "LE", 1), psId("1", "LE", 3)),
      opt("o6", "ps-que-nao-existe", psId("1", "LB", 2)),
      opt("o7", psId("0", "LB", 1), psId("0", "LB", 2), { deleted_at: 5 }),
      { id: "o8", kind: "walk", walk_minutes: 3, deleted_at: null },
    ],
    departure_alarm: [
      alarm("a1", "o1", 700),
      alarm("a2", "o2", 610),
      alarm("a3", "o2", 615, { enabled: 0, weekdays: [], once_date: "2026-12-24" }),
      alarm("a4", "o3", 800),
    ],
    trip: [
      { id: "u1", source: "user", timetable_id: ttId("1", "LA"), deleted_at: null },
      { id: "u2", source: "user", timetable_id: ttId("1", "LA"), deleted_at: null },
      { id: "u3", source: "user", timetable_id: ttId("0", "LB"), deleted_at: null },
      { id: "u4", source: "official", timetable_id: ttId("1", "LA"), deleted_at: null },
    ],
    stop_time: [
      { id: "d1", origin: "declared", trip_id: tripId("1", "LA", 600), deleted_at: null },
      { id: "d2", origin: "declared", trip_id: tripId("0", "LB", 700), deleted_at: null },
      { id: "d3", origin: "official", trip_id: tripId("1", "LA", 600), deleted_at: null },
    ],
    observation: [
      { id: "r1", pattern_stop_id: psId("1", "LA", 1), deviation_min: 2, deleted_at: null },
      { id: "r2", pattern_stop_id: psId("1", "LE", 3), deviation_min: 1, deleted_at: null },
      { id: "r3", pattern_stop_id: psId("0", "LB", 2), deviation_min: 0, deleted_at: null },
      { id: "r4", pattern_stop_id: psId("0", "LB", 2), deviation_min: null, deleted_at: null },
      { id: "r5", pattern_stop_id: psId("0", "LB", 2), deviation_min: 3, deleted_at: 9 },
    ],
  };
}

const run = (b: BackupTables = backup()) => checkReferences(b, anterior, novo);
const opcao = (id: string) => run().opcoes.find((o) => o.id === id)!;

describe("opções (C1)", () => {
  it("percurso mantido → mantida, sem traduzir", () => {
    expect(opcao("o1")).toMatchObject({ classe: "mantida", embarqueNovo: 1, descidaNova: 3 });
  });
  it("circular: embarca na 1ª e desce na última → resolve com posições novas diferentes", () => {
    expect(opcao("o2")).toMatchObject({ classe: "resolve", embarque: 1, embarqueNovo: 2, descida: 4, descidaNova: 5, ordemEmbarque: 1, ordemDescida: 2 });
  });
  it("ponto que saiu → ponto_fora; percurso que não existe → percurso_ausente; k-ésima passagem que falta → passagem_ausente", () => {
    expect(opcao("o3")).toMatchObject({ classe: "nao_resolve", motivo: "ponto_fora" });
    expect(opcao("o4")).toMatchObject({ classe: "nao_resolve", motivo: "percurso_ausente" });
    expect(opcao("o5")).toMatchObject({ classe: "nao_resolve", motivo: "passagem_ausente" });
  });
  it("pattern_stop fora do arquivo anterior; apagada e a de caminhada não entram; tabela ausente vale vazia", () => {
    expect(opcao("o6").classe).toBe("fora_do_arquivo");
    expect(run().opcoes.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4", "o5", "o6"]);
    const r = run({});
    expect(r.opcoes).toEqual([]);
    expect(r.podeImportar).toBe(true);
  });
  it("aceita o backup inteiro (com `tables`)", () => {
    expect(checkReferences({ tables: backup() }, anterior, novo).opcoes).toHaveLength(6);
  });
});

describe("avisos (C2)", () => {
  const aviso = (id: string) => run().avisos.find((a) => a.id === id)!;
  it("âncora igual ao horário-base de uma viagem nova → ok (a interpolada conta)", () => {
    expect(aviso("a1").ancora).toEqual({ tipo: "ok" });
    expect(aviso("a2").ancora).toEqual({ tipo: "ok" });
  });
  it("sem viagem de mesma hora → vizinhos abaixo e acima; enabled, weekdays e once_date saem como estão", () => {
    expect(aviso("a3").ancora).toEqual({ tipo: "sem_viagem", abaixo: 610, acima: 670 });
    expect(aviso("a3")).toMatchObject({ enabled: 0, weekdays: [], onceDate: "2026-12-24" });
    expect(aviso("a2")).toMatchObject({ enabled: 1, weekdays: [1, 2], onceDate: null });
  });
  it("aviso de opção que não resolve → opcao_nao_resolve", () => {
    expect(aviso("a4").ancora).toEqual({ tipo: "opcao_nao_resolve" });
  });
  it("aviso apagado não entra", () => {
    const b = backup();
    b.departure_alarm!.push(alarm("a9", "o1", 1, { deleted_at: 3 }));
    expect(run(b).avisos.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

describe("viagens, horários e registros (C3)", () => {
  it("só o percurso que mudou de id; viagem oficial e percurso mantido ficam de fora", () => {
    const r = run();
    expect(r.viagensUsuario).toEqual([{ codigo: "LA", n: 2 }]);
    expect(r.declarados).toEqual([{ codigo: "LA", n: 1 }]);
  });
  it("registros por percurso, separando os que a passagem traduz (vivos, com desvio)", () => {
    expect(run().registros).toEqual([
      { codigo: "LA", total: 1, traduz: 1, naoTraduz: 0 },
      { codigo: "LB", total: 1, traduz: 1, naoTraduz: 0 },
      { codigo: "LE", total: 1, traduz: 0, naoTraduz: 1 },
    ]);
  });
});

describe("texto (C4)", () => {
  it("igual em duas chamadas, seções na ordem fixa, sem nome de lugar", () => {
    const a = run().texto;
    expect(run().texto).toBe(a);
    expect(formatReferences(run())).toBe(a);
    const at = ["Opcoes", "Avisos", "Viagens e horarios do usuario", "Registros", "Resumo"].map((s) => a.indexOf(`\n${s}\n`) + 1 || a.indexOf(`${s}\n`));
    expect(at).toEqual([...at].sort((x, y) => x - y));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(a).not.toContain("Nome Secreto");
    expect(a).toContain("mobilis/stop/Q");
  });
  it("PODE_IMPORTAR só sem nao_resolve e sem aviso sem viagem; senão REVER", () => {
    expect(run().texto.trimEnd().endsWith("REVER")).toBe(true);
    const b = backup();
    b.option = [b.option![0]!, b.option![1]!];
    b.departure_alarm = [alarm("a1", "o1", 700), alarm("a2", "o2", 610)];
    expect(run(b).texto.trimEnd().endsWith("PODE_IMPORTAR")).toBe(true);
    b.departure_alarm!.push(alarm("a3", "o2", 615));
    expect(run(b).texto.trimEnd().endsWith("REVER")).toBe(true);
    b.departure_alarm = [alarm("a1", "o1", 700)];
    b.option!.push(opt("o3", psId("1", "LC", 2), psId("1", "LC", 3)));
    expect(run(b).texto.trimEnd().endsWith("REVER")).toBe(true);
  });
});
