/**
 * Linha de comando do importador do GTFS:
 *   node --experimental-strip-types tools/mobilis-seed/src/gtfs/cli.ts --feed <pasta> --config <arquivo.json>
 *     --corte AAAA-MM-DD --saida <pasta> [--anterior <arquivo.json>] [--sobrescrever]
 * Código de saída: 0 gerou; 1 erros de geração (nada escrito); 2 uso errado ou arquivo ilegível (nada escrito).
 * Só `runCli` com `CliIo` injetado é testado; o disco de verdade fica no fim do arquivo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSeedFile, SeedFormatError } from "@notebus/domain/src/seedFormat.ts";
import { lerFeed } from "../../../gtfs/lib/gtfs.mjs";
import { serialize } from "../build.ts";
import { parseNetworkConfig } from "./config.ts";
import { generateSeed } from "./generate.ts";
import { formatReport } from "./report.ts";
import { reuseKeys, type PatternVerdict } from "./reuse.ts";
import type { GtfsFeed, SeedFile } from "./types.ts";

export interface CliIo {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
  readFeed(dir: string): GtfsFeed;
  out(s: string): void;
  err(s: string): void;
}

const USAGE = "uso: --feed <pasta> --config <arquivo.json> --corte AAAA-MM-DD --saida <pasta> [--anterior <arquivo.json>] [--sobrescrever]";
const VALUE_FLAGS = ["--feed", "--config", "--corte", "--saida", "--anterior"];

export function runCli(args: string[], io: CliIo): number {
  const opt = new Map<string, string>();
  let overwrite = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--sobrescrever") overwrite = true;
    else if (VALUE_FLAGS.includes(a) && args[i + 1] !== undefined && !args[i + 1]!.startsWith("--")) opt.set(a, args[++i]!);
    else {
      io.err(`argumento inválido: ${a}\n${USAGE}`);
      return 2;
    }
  }
  for (const f of ["--feed", "--config", "--corte", "--saida"]) {
    if (!opt.has(f)) {
      io.err(`falta ${f}\n${USAGE}`);
      return 2;
    }
  }
  const cutoff = opt.get("--corte")!;
  const jsonPath = path.join(opt.get("--saida")!, `mobilis-${cutoff}.json`);
  const reportPath = path.join(opt.get("--saida")!, `relatorio-${cutoff}.txt`);

  // tudo que pode falhar por arquivo vem antes de qualquer escrita
  let feed: GtfsFeed;
  let config;
  let previous: SeedFile | null = null;
  try {
    const parsed = parseNetworkConfig(JSON.parse(io.readText(opt.get("--config")!)));
    if (!parsed.ok) {
      io.err(`configuração inválida:\n${parsed.problems.map((p) => `  - ${p}`).join("\n")}`);
      return 2;
    }
    config = parsed.config;
    feed = io.readFeed(opt.get("--feed")!);
    if (opt.has("--anterior")) previous = parseSeedFile(JSON.parse(io.readText(opt.get("--anterior")!)));
  } catch (e) {
    io.err(`não foi possível ler: ${e instanceof SeedFormatError ? e.problems.join("; ") : (e as Error).message}`);
    return 2;
  }
  const taken = [jsonPath, reportPath].filter((p) => io.exists(p));
  if (taken.length && !overwrite) {
    io.err(`já existe (use --sobrescrever): ${taken.join(", ")}`);
    return 2;
  }

  const result = generateSeed(feed, config, cutoff);
  const tableKeys = config.stops.map((s) => s.key);
  if (!result.ok) {
    io.err(formatReport({ cutoff, result, verdicts: null, previousVersion: previous?.dataset.version ?? null, tableKeys }));
    return 1;
  }
  let seed = result.seed;
  let verdicts: PatternVerdict[] | null = null;
  if (previous) ({ seed, verdicts } = reuseKeys(seed, previous));
  const text = serialize(seed);
  try {
    parseSeedFile(JSON.parse(text));
  } catch (e) {
    if (!(e instanceof SeedFormatError)) throw e;
    io.err(`o arquivo gerado não passou na validação: ${e.problems.join("; ")}`);
    return 1;
  }
  io.writeText(jsonPath, text);
  io.writeText(reportPath, formatReport({ cutoff, result: { ...result, seed }, verdicts, previousVersion: previous?.dataset.version ?? null, tableKeys }));
  io.out(`escrito: ${jsonPath}\nescrito: ${reportPath}`);
  return 0;
}

// Entrada de verdade (node ... cli.ts): não roda quando o arquivo é importado pelo teste.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2), {
    readText: (p) => readFileSync(p, "utf8"),
    writeText: (p, t) => writeFileSync(p, t),
    exists: (p) => existsSync(p),
    readFeed: (d) => lerFeed(d),
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  });
}
