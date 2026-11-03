import { describe, expect, it } from "vitest";
import { officialId } from "@notebus/domain/src/ids.ts";
import { runCli, type CliIo } from "./verReferencias.ts";
import type { SeedFile } from "./types.ts";

// Rede mínima inventada: um percurso A→B; `ver` muda o id do percurso (para o relatório sair REVER ou PODE_IMPORTAR).
function seedOf(ver: string): SeedFile {
  const pk = `mobilis/${ver}/pattern/L1`;
  const k = (key: string) => ({ id: officialId(key), key });
  return {
    format: "notebus.mobilis-seed",
    formatVersion: 2,
    network: { name: "Rede Exemplo", timezone: "Europe/Lisbon" },
    dataset: { name: "exemplo", version: ver },
    stops: [{ ...k("mobilis/stop/A"), name: "Nome Secreto A", aliases: [], externalId: null }, { ...k("mobilis/stop/B"), name: "Nome Secreto B", aliases: [], externalId: null }],
    lines: [{ ...k("mobilis/line/1"), code: "1", name: "Linha Um", color: "#111111" }],
    patterns: [{ ...k(pk), code: "L1", lineId: officialId("mobilis/line/1"), label: "Ida", isCircular: false }],
    patternStops: [1, 2].map((p) => ({ ...k(`${pk}/pos/${p}`), patternId: officialId(pk), position: p, stopId: officialId(`mobilis/stop/${p === 1 ? "A" : "B"}`), isTimepoint: true, timepointLabel: "T" })),
    timetables: [{ ...k(`mobilis/${ver}/timetable/L1`), patternId: officialId(pk), validFrom: `2026-0${ver}-01`, validTo: null }],
    trips: [],
    stopTimes: [],
  };
}

const optionRow = { id: "o1", kind: "bus", board_pattern_stop_id: officialId("mobilis/1/pattern/L1/pos/1"), alight_pattern_stop_id: officialId("mobilis/1/pattern/L1/pos/2"), deleted_at: null };

function fake(files: Record<string, string>) {
  const written: Record<string, string> = {};
  const errs: string[] = [];
  const io: CliIo = {
    readText: (p) => {
      if (!(p in files)) throw new Error(`sem arquivo ${p}`);
      return files[p]!;
    },
    writeText: (p, t) => void (written[p] = t),
    exists: (p) => p in files || p.replaceAll("\\", "/") in files || p in written,
    out: () => {},
    err: (s) => void errs.push(s),
  };
  return { io, written, errs };
}

const base = (): Record<string, string> => ({
  "b.json": JSON.stringify({ tables: { option: [optionRow] } }),
  "a.json": JSON.stringify(seedOf("1")),
  "n.json": JSON.stringify(seedOf("2")),
});
const args = ["--backup", "b.json", "--anterior", "a.json", "--novo", "n.json", "--saida", "out"];
const target = "out/referencias.txt";
const norm = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([p, t]) => [p.replaceAll("\\", "/"), t]));

describe("runCli do relatório de referências (C5)", () => {
  it("grava referencias.txt e sai com 0; REVER ainda escreve e sai com 0", () => {
    const f = fake(base());
    expect(runCli(args, f.io), f.errs.join()).toBe(0);
    const w = norm(f.written);
    expect(Object.keys(w)).toEqual([target]);
    expect(w[target]).toContain("Opcoes");
    expect(w[target]!.trimEnd().endsWith("PODE_IMPORTAR")).toBe(true);
    const files = base();
    files["n.json"] = JSON.stringify({ ...seedOf("2"), patterns: [] , patternStops: [], timetables: [] });
    const r = fake(files);
    expect(runCli(args, r.io)).toBe(0);
    expect(norm(r.written)[target]!.trimEnd().endsWith("REVER")).toBe(true);
  });

  it("existe e sem --sobrescrever → 2 e nada escrito; com a flag → 0", () => {
    const f = fake({ ...base(), [target]: "antigo" });
    expect(runCli(args, f.io)).toBe(2);
    expect(f.written).toEqual({});
    expect(runCli([...args, "--sobrescrever"], f.io)).toBe(0);
    expect(Object.keys(f.written)).toHaveLength(1);
  });

  it("uso errado → 2 e nada escrito", () => {
    const f = fake(base());
    expect(runCli([...args, "--xis"], f.io)).toBe(2);
    for (const flag of ["--backup", "--anterior", "--novo", "--saida"]) {
      const i = args.indexOf(flag);
      expect(runCli(args.filter((_, j) => j !== i && j !== i + 1), f.io)).toBe(2);
    }
    expect(f.written).toEqual({});
  });

  it("backup que não é JSON, sem tables, ou arquivo de rede inválido → 2 e nada escrito", () => {
    for (const [name, text] of [["b.json", "não é json"], ["b.json", JSON.stringify({ outra: 1 })], ["a.json", JSON.stringify({ format: "x" })], ["n.json", "{"]] as const) {
      const f = fake({ ...base(), [name]: text });
      expect(runCli(args, f.io)).toBe(2);
      expect(f.written).toEqual({});
    }
  });
});
