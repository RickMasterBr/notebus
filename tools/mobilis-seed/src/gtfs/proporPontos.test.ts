import path from "node:path";
import { describe, expect, it } from "vitest";
import { serialize } from "../build.ts";
import type { CliIo } from "./cli.ts";
import { generateSeed } from "./generate.ts";
import { runCli } from "./proporPontos.ts";
import type { GtfsFeed, NetworkConfig } from "./types.ts";

const WEEK = ["1", "1", "1", "1", "1", "0", "0"];
/** Feed inventado de uma rota R1 com as paragens [id, código, nome] numa viagem. */
const feedOf = (stops: [string, string, string][]): GtfsFeed => ({
  info: { versao: "t", inicio: "20260101", fim: "20270131" },
  rotas: [{ id: "R1", nomeCurto: "1" }],
  viagens: [{ id: "t1", rota: "R1", servico: "A-U", direcao: "0" }],
  horarios: stops.map(([parada], i) => ({ viagem: "t1", parada, sequencia: i + 1, hora: `08:${String(i * 5).padStart(2, "0")}:00`, controle: true })),
  paradas: stops.map(([id, codigo, nome]) => ({ id, codigo, nome, lat: 39.7, lon: -8.8 })),
  calendario: [{ servico: "A-U", dias: WEEK, inicio: "20260101", fim: "20270131" }],
  excecoes: [],
});
const config: NetworkConfig = {
  network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
  datasetName: "exemplo",
  lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
  patterns: [{ routeId: "R1", code: "L1-s1", line: "1", label: "Ida", isCircular: false }],
  stops: [],
  holidays: [],
};

// anterior: Alfa, Meio (sem par no feed novo, lacuna 1 e 2), Beta
const old = generateSeed(
  feedOf([["o1", "1", "Alfa"], ["o2", "2", "Meio"], ["o3", "3", "Beta"]]),
  { ...config, stops: [["o1", "Alfa"], ["o2", "Meio"], ["o3", "Beta"]].map(([stopId, name]) => ({ stopId: stopId!, key: `k/${name}`, name: name!, aliases: [], externalId: null })) },
  "2026-09-01",
);
if (!old.ok) throw new Error("anterior inventado deveria gerar");
const oldText = serialize(old.seed);
const feed = feedOf([["a", "A1", "ALFA"], ["m1", "M1", "Um"], ["m2", "M2", "Dois"], ["b", "B1", "Beta"], ["n", "N1", "Nova"]]);

function fake(files: Record<string, string> = {}) {
  const disk = new Map(Object.entries({ "cfg.json": JSON.stringify(config), "ant.json": oldText,...files }));
  const writes: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    readText: (p) => {
      if (!disk.has(p)) throw new Error(`sem arquivo ${p}`);
      return disk.get(p)!;
    },
    writeText: (p, t) => {
      writes.push(p);
      disk.set(p, t);
    },
    exists: (p) => disk.has(p),
    readFeed: () => feed,
    out: () => {},
    err: (s) => err.push(s),
  };
  return { io, disk, writes, err };
}

const ARGS = ["--feed", "feed", "--config", "cfg.json", "--anterior", "ant.json", "--saida", "saida"];
const JSON_PATH = path.join("saida", "pontos-proposta.json");
const TXT_PATH = path.join("saida", "pontos-proposta.txt");

describe("proporPontos runCli", () => {
  it("grava pontos-proposta.json e .txt com source, patterns, pending e conflicts e devolve 0", () => {
    const f = fake();
    expect(runCli(ARGS, f.io)).toBe(0);
    expect(f.writes.sort()).toEqual([JSON_PATH, TXT_PATH]);
    const out = JSON.parse(f.disk.get(JSON_PATH)!);
    expect(out.stops).toEqual([
      { stopId: "a", key: "k/Alfa", name: "Alfa", aliases: [], externalId: null, source: "nome", patterns: ["L1-s1"] },
      { stopId: "b", key: "k/Beta", name: "Beta", aliases: [], externalId: null, source: "nome", patterns: ["L1-s1"] },
      { stopId: "m1", key: "mobilis/stop/M1", name: "Um", aliases: [], externalId: null, source: "novo", patterns: ["L1-s1"] },
      { stopId: "m2", key: "mobilis/stop/M2", name: "Dois", aliases: [], externalId: null, source: "novo", patterns: ["L1-s1"] },
      { stopId: "n", key: "mobilis/stop/N1", name: "Nova", aliases: [], externalId: null, source: "novo", patterns: ["L1-s1"] },
    ]);
    expect(out.pending).toEqual([
      { pattern: "L1-s1", position: 2, key: "k/Meio", name: "Meio", candidates: [{ stopId: "m1", code: "M1", name: "Um" }, { stopId: "m2", code: "M2", name: "Dois" }] },
    ]);
    expect(out.conflicts).toEqual([]);
  });

  it("o resumo conta por source e lista as pendentes", () => {
    const f = fake();
    runCli(ARGS, f.io);
    const txt = f.disk.get(TXT_PATH)!;
    expect(txt).toContain("nome: 2");
    expect(txt).toContain("novo: 3");
    expect(txt).toContain("intervalo: 0");
    expect(txt).toContain("pendentes: 1");
    expect(txt).toContain("L1-s1 posição 2: k/Meio");
  });

  it("saída que já existe sem --sobrescrever devolve 2 sem escrever; com a opção, escreve", () => {
    const f = fake({ [TXT_PATH]: "antigo" });
    expect(runCli(ARGS, f.io)).toBe(2);
    expect(f.writes).toEqual([]);
    expect(f.disk.get(TXT_PATH)).toBe("antigo");
    expect(runCli([...ARGS, "--sobrescrever"], f.io)).toBe(0);
    expect(f.writes.sort()).toEqual([JSON_PATH, TXT_PATH]);
  });

  it("flag desconhecida ou falta de --feed, --config, --anterior ou --saida devolve 2 sem escrever", () => {
    const cases = [[...ARGS, "--nada"], ...[0, 2, 4, 6].map((i) => ARGS.filter((_, k) => k !== i && k !== i + 1)), ["--feed"]];
    for (const args of cases) {
      const f = fake();
      expect(runCli(args, f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });

  it("configuração ou anterior ilegível devolve 2 sem escrever", () => {
    const bad: Record<string, string>[] = [{ "cfg.json": "{x" }, { "ant.json": "{x" }, { "ant.json": "{}" }, { "cfg.json": JSON.stringify({ ...config, lines: [] }) }];
    for (const files of bad) {
      const f = fake(files);
      expect(runCli(ARGS, f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
    const f = fake();
    expect(runCli(["--feed", "feed", "--config", "cfg.json", "--anterior", "nao-existe.json", "--saida", "saida"], f.io)).toBe(2);
    expect(f.writes).toEqual([]);
  });
});
