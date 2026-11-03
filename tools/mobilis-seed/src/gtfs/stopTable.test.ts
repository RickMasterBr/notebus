import { describe, expect, it } from "vitest";
import { generateSeed } from "./generate.ts";
import { normalizeName, proposeStopTable } from "./stopTable.ts";
import type { GtfsFeed, NetworkConfig, SeedFile } from "./types.ts";

const WEEK = ["1", "1", "1", "1", "1", "0", "0"];
/** Paragem do feed: [stopId, código, nome]. */
type F = [string, string, string];
/** Ponto do app: nome, externalId, apelidos; a chave é `k/<nome>`. */
interface App {
  name: string;
  ext?: string;
  aliases?: string[];
}

/** Feed inventado: cada rota tem uma ou mais viagens (sequências de paragens). */
function feedOf(routes: Record<string, F[][]>): GtfsFeed {
  const paradas = new Map<string, GtfsFeed["paradas"][number]>();
  const viagens: GtfsFeed["viagens"] = [];
  const horarios: GtfsFeed["horarios"] = [];
  for (const [rota, trips] of Object.entries(routes)) {
    trips.forEach((seq, t) => {
      const id = `${rota}-t${t}`;
      viagens.push({ id, rota, servico: "A-U", direcao: "0" });
      seq.forEach(([stopId, codigo, nome], i) => {
        paradas.set(stopId, { id: stopId, codigo, nome, lat: 39.7, lon: -8.8 });
        horarios.push({ viagem: id, parada: stopId, sequencia: i + 1, hora: `08:${String(i).padStart(2, "0")}:00`, controle: true });
      });
    });
  }
  return {
    info: { versao: "t", inicio: "20260101", fim: "20270131" },
    rotas: Object.keys(routes).map((id) => ({ id, nomeCurto: "1" })),
    viagens,
    horarios,
    paradas: [...paradas.values()],
    calendario: [{ servico: "A-U", dias: WEEK, inicio: "20260101", fim: "20270131" }],
    excecoes: [],
  };
}

const patternsOf = (codes: string[]): NetworkConfig["patterns"] => codes.map((code) => ({ routeId: `R${code}`, code, line: "1", label: "Ida", isCircular: false }));

/** Arquivo anterior inventado, gerado pelo próprio gerador a partir de pontos do app. */
function previousOf(patterns: Record<string, App[]>): SeedFile {
  const apps = new Map<string, App>();
  const routes: Record<string, F[][]> = {};
  for (const [code, stops] of Object.entries(patterns)) {
    routes[`R${code}`] = [stops.map((s): F => [`p/${s.name}`, `Z${apps.size}${s.name}`, s.name])];
    for (const s of stops) apps.set(s.name, s);
  }
  const config: NetworkConfig = {
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    datasetName: "exemplo",
    lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
    patterns: patternsOf(Object.keys(patterns)),
    stops: [...apps.values()].map((s) => ({ stopId: `p/${s.name}`, key: `k/${s.name}`, name: s.name, aliases: s.aliases ?? [], externalId: s.ext ?? null })),
    holidays: [],
  };
  const r = generateSeed(feedOf(routes), config, "2026-09-01");
  if (!r.ok) throw new Error(`anterior inventado deveria gerar: ${JSON.stringify(r.errors)}`);
  return r.seed;
}

const f = (id: string, code: string, name: string): F => [id, code, name];
const entryOf = (p: ReturnType<typeof proposeStopTable>, stopId: string) => p.entries.find((e) => e.stopId === stopId);

describe("normalizeName", () => {
  it("minúsculas, sem acento, só letras e números, espaços juntados", () => {
    expect(normalizeName("  Praça  D. João-I, nº 3 ")).toBe("praca d joao i n 3");
  });
});

describe("C1: âncoras por nome e por código", () => {
  const prev = previousOf({
    LX: [{ name: "Praça Central", aliases: ["Pç. Central"] }, { name: "Rua Alta" }, { name: "Largo Novo", ext: "E7" }, { name: "Escola" }, { name: "Mercado" }, { name: "Estação", ext: "E9" }],
  });
  const feed = feedOf({ RLX: [[f("a", "1", "PRACA CENTRAL"), f("b", "2", "rua  alta"), f("c", "E7", "Outro Nome Qualquer"), f("d", "4", "ESCOLA"), f("e", "5", "mercado"), f("g", "6", "Estacao")]] });
  const p = proposeStopTable(feed, { patterns: patternsOf(["LX"]) }, prev);

  it("nome igual com acento e caixa diferentes pareia como nome; externalId = stop_code pareia como codigo", () => {
    expect(p.entries.map((e) => [e.stopId, e.source])).toEqual([["a", "nome"], ["b", "nome"], ["c", "codigo"], ["d", "nome"], ["e", "nome"], ["g", "nome"]]);
    expect(p.pending).toEqual([]);
  });

  it("a entrada leva key, name, aliases e externalId do app", () => {
    expect(entryOf(p, "a")).toEqual({ stopId: "a", key: "k/Praça Central", name: "Praça Central", aliases: ["Pç. Central"], externalId: null, source: "nome", patterns: ["LX"] });
    expect(entryOf(p, "c")).toMatchObject({ key: "k/Largo Novo", name: "Largo Novo", externalId: "E7" });
  });

  it("a ordem manda: nome igual fora de ordem não cruza pares", () => {
    const rev = feedOf({ RLX: [[f("c", "C", "Estação"), f("b", "B", "Mercado"), f("a", "A", "Escola")]] });
    const q = proposeStopTable(rev, { patterns: patternsOf(["LX"]) }, previousOf({ LX: [{ name: "Escola" }, { name: "Mercado" }, { name: "Estação" }] }));
    const paired = q.entries.filter((e) => e.source === "nome");
    expect(paired).toHaveLength(1);
    expect(paired[0]).toMatchObject({ stopId: "c", key: "k/Estação" });
    expect(q.pending.map((x) => x.position)).toEqual([1, 2]);
  });
});

describe("C2: lacunas", () => {
  const A = (n: string): App => ({ name: n });
  const run = (app: string[], feedSeq: F[]) => proposeStopTable(feedOf({ RLX: [feedSeq] }), { patterns: patternsOf(["LX"]) }, previousOf({ LX: app.map(A) }));

  it("lacuna de 2 e 2 entre âncoras pareia em ordem como intervalo", () => {
    const p = run(["Alfa", "x1", "x2", "Beta"], [f("a", "1", "alfa"), f("y1", "2", "Yy"), f("y2", "3", "Zz"), f("b", "4", "beta")]);
    expect(p.entries.map((e) => [e.stopId, e.key, e.source])).toEqual([["a", "k/Alfa", "nome"], ["b", "k/Beta", "nome"], ["y1", "k/x1", "intervalo"], ["y2", "k/x2", "intervalo"]]);
    expect(p.pending).toEqual([]);
  });

  it("lacuna de 2 no app e 3 no feed vai para pending com as 3 candidatas", () => {
    const p = run(["Alfa", "x1", "x2", "Beta"], [f("a", "1", "alfa"), f("y1", "C1", "Yy"), f("y2", "C2", "Zz"), f("y3", "C3", "Ww"), f("b", "4", "beta")]);
    const cands = [{ stopId: "y1", code: "C1", name: "Yy" }, { stopId: "y2", code: "C2", name: "Zz" }, { stopId: "y3", code: "C3", name: "Ww" }];
    expect(p.pending).toEqual([
      { pattern: "LX", position: 2, key: "k/x1", name: "x1", candidates: cands },
      { pattern: "LX", position: 3, key: "k/x2", name: "x2", candidates: cands },
    ]);
    expect(p.entries.filter((e) => e.source === "intervalo")).toEqual([]);
  });

  it("lacuna de 2 no app e 0 no feed vai para pending sem candidatas", () => {
    const p = run(["Alfa", "x1", "x2", "Beta"], [f("a", "1", "alfa"), f("b", "4", "beta")]);
    expect(p.pending.map((x) => [x.position, x.candidates])).toEqual([[2, []], [3, []]]);
  });

  it("lacunas nas pontas valem igual: equilibrada pareia, desequilibrada fica pendente", () => {
    const p = run(["x1", "Alfa", "Beta", "x2", "x3"], [f("y1", "1", "Yy"), f("a", "2", "alfa"), f("b", "3", "beta"), f("y2", "4", "Zz")]);
    expect(entryOf(p, "y1")).toMatchObject({ key: "k/x1", source: "intervalo" });
    expect(p.pending.map((x) => [x.position, x.candidates.map((c) => c.stopId)])).toEqual([[4, ["y2"]], [5, ["y2"]]]);
  });
});

describe("C3: paragens do feed sem par", () => {
  it("código único → novo com mobilis/stop/<código>; vazio ou repetido → novo_sem_codigo com mobilis/stop/<stopId>", () => {
    const feed = feedOf({ RLX: [[f("a", "1", "Alfa"), f("n1", "U1", "Sozinha"), f("n2", "", "Sem Codigo"), f("n3", "DUP", "Repetida 1"), f("n4", "DUP", "Repetida 2")]] });
    const p = proposeStopTable(feed, { patterns: patternsOf(["LX"]) }, previousOf({ LX: [{ name: "Alfa" }] }));
    expect(entryOf(p, "n1")).toMatchObject({ key: "mobilis/stop/U1", name: "Sozinha", aliases: [], externalId: null, source: "novo", patterns: ["LX"] });
    expect(entryOf(p, "n2")).toMatchObject({ key: "mobilis/stop/n2", source: "novo_sem_codigo" });
    expect(entryOf(p, "n3")).toMatchObject({ key: "mobilis/stop/n3", source: "novo_sem_codigo" });
    expect(entryOf(p, "n4")).toMatchObject({ key: "mobilis/stop/n4", source: "novo_sem_codigo" });
  });

  it("paragem que só aparece numa sequência minoritária da rota também entra", () => {
    const feed = feedOf({ RLX: [[f("a", "1", "Alfa"), f("b", "2", "Beta"), f("c", "3", "Gama")], [f("a", "1", "Alfa"), f("z", "Z9", "So Na Variante")]] });
    const p = proposeStopTable(feed, { patterns: patternsOf(["LX"]) }, previousOf({ LX: [{ name: "Alfa" }, { name: "Beta" }, { name: "Gama" }] }));
    expect(entryOf(p, "z")).toMatchObject({ key: "mobilis/stop/Z9", source: "novo" });
  });

  it("ponto do app sem par não gera entrada; percurso sem correspondente no anterior só tem novos", () => {
    const feed = feedOf({ RLX: [[f("a", "1", "Alfa"), f("b", "2", "Beta")]], RLY: [[f("a", "1", "Alfa"), f("c", "3", "Gama")]] });
    const p = proposeStopTable(feed, { patterns: patternsOf(["LX", "LY"]) }, previousOf({ LX: [{ name: "Alfa" }, { name: "Perdido" }, { name: "Beta" }] }));
    expect(p.entries.some((e) => e.key === "k/Perdido")).toBe(false);
    expect(p.pending.map((x) => x.key)).toEqual(["k/Perdido"]);
    expect(entryOf(p, "c")).toMatchObject({ key: "mobilis/stop/3", source: "novo", patterns: ["LY"] });
    expect(entryOf(p, "a")).toMatchObject({ key: "k/Alfa", patterns: ["LX"] });
  });
});

describe("C4: conflitos, ordem fixa e pureza", () => {
  const two = (x: App[], y: App[]) => previousOf({ LX: x, LY: y });
  const patterns = patternsOf(["LX", "LY"]);

  it("a mesma paragem pareada a duas chaves fica com a menor e aparece em conflicts", () => {
    const feed = feedOf({ RLX: [[f("f1", "9", "Praça")]], RLY: [[f("f1", "9", "Praca")]] });
    // nomes do app diferentes só no que a normalização ignora: duas chaves para a mesma paragem
    const prev = two([{ name: "Praça" }], [{ name: "Praca" }]);
    const p = proposeStopTable(feed, { patterns }, prev);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({ stopId: "f1", key: "k/Praca", patterns: ["LY"] });
    expect(p.conflicts).toEqual([{ kind: "stopId", id: "f1", values: ["k/Praca", "k/Praça"], kept: "k/Praca" }]);
  });

  it("na disputa entre chaves vence a de externalId igual ao código, mesmo sendo a maior", () => {
    const feed = feedOf({ RLX: [[f("f1", "E1", "Praça")]], RLY: [[f("f1", "E1", "Praca")]] });
    const p = proposeStopTable(feed, { patterns }, two([{ name: "Praça", ext: "E1" }], [{ name: "Praca" }]));
    expect(p.entries[0]).toMatchObject({ key: "k/Praça", source: "codigo" });
    expect(p.conflicts[0]).toMatchObject({ kind: "stopId", kept: "k/Praça" });
  });

  it("a mesma chave pedida por duas paragens fica com a de menor stopId e a outra vira novo", () => {
    const feed = feedOf({ RLX: [[f("a", "1", "Alfa"), f("f2", "C2", "Qq"), f("b", "2", "Beta")]], RLY: [[f("c", "3", "Gama"), f("f1", "C1", "Rr"), f("d", "4", "Delta")]] });
    const prev = two([{ name: "Alfa" }, { name: "K" }, { name: "Beta" }], [{ name: "Gama" }, { name: "K" }, { name: "Delta" }]);
    const p = proposeStopTable(feed, { patterns }, prev);
    expect(entryOf(p, "f1")).toMatchObject({ key: "k/K", source: "intervalo" });
    expect(entryOf(p, "f2")).toMatchObject({ key: "mobilis/stop/C2", source: "novo" });
    expect(p.conflicts).toEqual([{ kind: "key", id: "k/K", values: ["f1", "f2"], kept: "f1" }]);
  });

  it("a mesma chave pedida por duas paragens fica com a de código igual ao externalId", () => {
    const feed = feedOf({ RLX: [[f("a", "1", "Alfa"), f("f2", "C2", "Qq"), f("b", "2", "Beta")]], RLY: [[f("c", "3", "Gama"), f("f1", "C1", "Rr"), f("d", "4", "Delta")]] });
    const prev = two([{ name: "Alfa" }, { name: "K", ext: "C2" }, { name: "Beta" }], [{ name: "Gama" }, { name: "K", ext: "C2" }, { name: "Delta" }]);
    const p = proposeStopTable(feed, { patterns }, prev);
    expect(entryOf(p, "f2")).toMatchObject({ key: "k/K", source: "codigo" });
    expect(entryOf(p, "f1")).toMatchObject({ key: "mobilis/stop/C1", source: "novo" });
  });

  it("duas chamadas com a mesma entrada dão a mesma saída, em ordem de stopId e sem repetição", () => {
    const feed = feedOf({ RLX: [[f("z", "1", "Zeta"), f("a", "2", "Alfa"), f("m", "3", "Mu")]], RLY: [[f("a", "2", "Alfa"), f("m", "3", "Mu")]] });
    const prev = two([{ name: "Zeta" }, { name: "Alfa" }, { name: "Mu" }], [{ name: "Alfa" }, { name: "Mu" }]);
    const p1 = proposeStopTable(feed, { patterns }, prev);
    expect(proposeStopTable(feed, { patterns }, prev)).toEqual(p1);
    expect(p1.entries.map((e) => e.stopId)).toEqual(["a", "m", "z"]);
    expect(p1.entries.find((e) => e.stopId === "a")!.patterns).toEqual(["LX", "LY"]);
  });
});
