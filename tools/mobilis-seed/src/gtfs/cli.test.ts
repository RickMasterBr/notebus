import path from "node:path";
import { describe, expect, it } from "vitest";
import { serialize } from "../build.ts";
import { runCli, type CliIo } from "./cli.ts";
import { generateSeed } from "./generate.ts";
import type { GtfsFeed, NetworkConfig } from "./types.ts";

const WEEK = ["1", "1", "1", "1", "1", "0", "0"];
const trip = (viagem: string, h: string[]) => ["s1", "s2", "s3"].map((parada, i) => ({ viagem, parada, sequencia: i + 1, hora: h[i]!, controle: true }));
const feed: GtfsFeed = {
  info: { versao: "t", inicio: "20260101", fim: "20270131" },
  rotas: [{ id: "R1", nomeCurto: "1" }],
  viagens: [{ id: "t1", rota: "R1", servico: "A-U", direcao: "0" }],
  horarios: trip("t1", ["08:00:00", "08:10:00", "08:20:00"]),
  paradas: ["s1", "s2", "s3"].map((id, i) => ({ id, codigo: `G${i + 1}`, nome: `Parada ${id}`, lat: 39.7 + i / 100, lon: -8.8 })),
  calendario: [{ servico: "A-U", dias: WEEK, inicio: "20260101", fim: "20270131" }],
  excecoes: [],
};
const config: NetworkConfig = {
  network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
  datasetName: "exemplo",
  lines: [{ number: "1", name: "Linha Um", color: "#111111" }],
  patterns: [{ routeId: "R1", code: "L1-s1", line: "1", label: "Ida", isCircular: false }],
  stops: [],
  holidays: [],
};

/** Disco falso em memória; `writes` guarda o que foi escrito. */
function fake(files: Record<string, string> = {}, theFeed: GtfsFeed = feed) {
  const disk = new Map(Object.entries({ "cfg.json": JSON.stringify(config), ...files }));
  const writes: string[] = [];
  const out: string[] = [];
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
    readFeed: () => theFeed,
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  };
  return { io, disk, writes, out, err };
}

const ARGS = ["--feed", "feed", "--config", "cfg.json", "--corte", "2026-11-01", "--saida", "saida"];
const JSON_PATH = path.join("saida", "mobilis-2026-11-01.json");
const REPORT_PATH = path.join("saida", "relatorio-2026-11-01.txt");

describe("runCli", () => {
  it("gera mobilis-<corte>.json e relatorio-<corte>.txt e devolve 0", () => {
    const f = fake();
    expect(runCli(ARGS, f.io)).toBe(0);
    expect(f.writes.sort()).toEqual([JSON_PATH, REPORT_PATH]);
    expect(JSON.parse(f.disk.get(JSON_PATH)!).formatVersion).toBe(2);
    expect(f.disk.get(REPORT_PATH)).toContain("== Resumo ==");
  });

  it("erro de geração devolve 1 sem escrever nada", () => {
    const f = fake();
    expect(runCli(["--feed", "feed", "--config", "cfg.json", "--corte", "2028-01-01", "--saida", "saida"], f.io)).toBe(1);
    expect(f.writes).toEqual([]);
    expect(f.err.join("\n")).toContain("CORTE_FORA_DO_FEED");
  });

  it("uso errado devolve 2: sem --feed, argumento desconhecido, valor faltando", () => {
    for (const args of [ARGS.slice(2), [...ARGS, "--nada"], ["--feed"]]) {
      const f = fake();
      expect(runCli(args, f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });

  it("configuração ilegível ou inválida devolve 2 sem escrever", () => {
    for (const cfg of ["{não é json", JSON.stringify({ ...config, lines: [] })]) {
      const f = fake({ "cfg.json": cfg });
      expect(runCli(ARGS, f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });

  it("saída que já existe sem --sobrescrever devolve 2 sem escrever; com a opção, escreve", () => {
    const f = fake({ [REPORT_PATH]: "antigo" });
    expect(runCli(ARGS, f.io)).toBe(2);
    expect(f.writes).toEqual([]);
    expect(f.disk.get(REPORT_PATH)).toBe("antigo");
    expect(runCli([...ARGS, "--sobrescrever"], f.io)).toBe(0);
    expect(f.writes.sort()).toEqual([JSON_PATH, REPORT_PATH]);
  });

  it("--anterior aplica a camada A: chaves do anterior e o relatório lista os mantidos", () => {
    const first = generateSeed(feed, config, "2026-09-01");
    if (!first.ok) throw new Error("feed inventado deveria gerar");
    const f = fake({ "ant.json": serialize(first.seed) });
    expect(runCli([...ARGS, "--anterior", "ant.json"], f.io)).toBe(0);
    const seed = JSON.parse(f.disk.get(JSON_PATH)!);
    expect(seed.patterns[0].key).toBe("mobilis/2026-09-01/pattern/L1-s1");
    expect(seed.dataset.version).toBe("2026-11-01");
    expect(f.disk.get(REPORT_PATH)).toContain("mantidos (1): L1-s1");
    expect(f.disk.get(REPORT_PATH)).toContain("arquivo anterior: 2026-09-01");
  });

  it("anterior ilegível ou que não é um arquivo da MOBILIS devolve 2 sem escrever", () => {
    for (const ant of ["{x", "{}"]) {
      const f = fake({ "ant.json": ant });
      expect(runCli([...ARGS, "--anterior", "ant.json"], f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });
});
