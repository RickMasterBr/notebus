import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli, type CliIo } from "./gerarTracados.ts";

// Feed inventado: rota A (duas variantes, uma de 3 paradas e outra de 2) e rota 10 (traçado ziguezague).
const FEED: Record<string, string> = {
  "routes.txt": "﻿route_id,route_short_name\r\nrA,A\r\nr10,10\r\n",
  "trips.txt": "route_id,trip_id,shape_id\r\nrA,t1,sA\r\nrA,t2,sAcurta\r\nr10,t3,sZ\r\n",
  "stop_times.txt": "trip_id,stop_id\r\nt1,p1\r\nt1,p2\r\nt1,p3\r\nt2,p1\r\nt2,p2\r\nt3,p1\r\nt3,p2\r\n",
  "shapes.txt":
    "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\r\n" +
    "sA,39.00000,-8.00000,1\r\nsA,39.00003,-7.99950,2\r\nsA,39.00000,-7.99900,3\r\n" +
    "sAcurta,39,-8,1\r\nsAcurta,39.1,-8,2\r\n" +
    "sZ,39.0,-8.000,1\r\nsZ,39.001,-8.001,2\r\nsZ,39.002,-8.000,3\r\n",
};
const FEED_DIR = path.join("feed");
const OUT_DIR = path.join("saida");
const ALVO = path.join(OUT_DIR, "mobilis-2026-09-01.shapes.json");

function fake(files: Record<string, string> = FEED) {
  const fs = new Map<string, string>(Object.entries(files).map(([n, t]) => [path.join(FEED_DIR, n), t]));
  const out: string[] = [];
  const err: string[] = [];
  const writes: string[] = [];
  const io: CliIo = {
    readText: (p) => fs.get(p) ?? "",
    writeText: (p, t) => {
      writes.push(p);
      fs.set(p, t);
    },
    exists: (p) => fs.has(p),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
  };
  return { fs, io, out, err, writes };
}
const ARGS = ["--feed", FEED_DIR, "--corte", "2026-09-01", "--saida", OUT_DIR];

describe("runCli (C5)", () => {
  it("grava o arquivo e imprime uma linha por rota com pontos antes e depois", () => {
    const f = fake();
    expect(runCli(ARGS, f.io)).toBe(0);
    const j = JSON.parse(f.fs.get(ALVO)!);
    expect(j.formas.map((x: { forma: string }) => x.forma)).toEqual(["sZ", "sA"]);
    expect(f.out.some((l) => l.includes("linha A") && l.includes("3 -> 2"))).toBe(true);
    expect(f.out.some((l) => l.includes("linha 10") && l.includes("3 -> 3"))).toBe(true);
  });
  it("arquivo existente sem --sobrescrever → 2 e nada gravado; com a flag → 0", () => {
    const f = fake();
    f.fs.set(ALVO, "antigo");
    expect(runCli(ARGS, f.io)).toBe(2);
    expect(f.writes).toEqual([]);
    expect(f.fs.get(ALVO)).toBe("antigo");
    expect(runCli([...ARGS, "--sobrescrever"], f.io)).toBe(0);
    expect(f.fs.get(ALVO)).not.toBe("antigo");
  });
  it("--corte inválido → 2", () => {
    for (const corte of ["2026-13-40", "2026-9-1", "2026-02-30"]) {
      const f = fake();
      expect(runCli(["--feed", FEED_DIR, "--corte", corte, "--saida", OUT_DIR], f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });
  it("uso errado → 2", () => {
    for (const a of [ARGS.slice(2), ["--feed", FEED_DIR, "--saida", OUT_DIR], ARGS.slice(0, 4), [...ARGS, "--x"]]) {
      const f = fake();
      expect(runCli(a, f.io)).toBe(2);
      expect(f.writes).toEqual([]);
    }
  });
  it("shapes.txt ausente → 2", () => {
    const { "shapes.txt": _, ...resto } = FEED;
    const f = fake(resto);
    expect(runCli(ARGS, f.io)).toBe(2);
    expect(f.writes).toEqual([]);
  });
  it("erro de escolha ou de forma → 2 e nada gravado", () => {
    const ausente = fake({ ...FEED, "trips.txt": "route_id,trip_id,shape_id\r\nrA,t1,nao\r\n" });
    expect(runCli(ARGS, ausente.io)).toBe(2);
    expect(ausente.writes).toEqual([]);
    const curta = fake({ ...FEED, "shapes.txt": FEED["shapes.txt"]!.replace("sZ,39.001,-8.001,2\r\nsZ,39.002,-8.000,3\r\n", "") });
    expect(runCli(ARGS, curta.io)).toBe(2);
    expect(curta.writes).toEqual([]);
  });
  it("só aviso → 0 e grava, dizendo qual rota foi pulada", () => {
    const f = fake({ ...FEED, "routes.txt": FEED["routes.txt"] + "rVazia,V\r\n" });
    expect(runCli(ARGS, f.io)).toBe(0);
    expect(f.writes).toEqual([ALVO]);
    expect(f.out.some((l) => l.includes("ROTA_SEM_VIAGENS") && l.includes("rVazia"))).toBe(true);
  });
});
