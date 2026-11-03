/**
 * Proposta da tabela de equivalência de pontos do importador do GTFS:
 *   node --experimental-strip-types tools/mobilis-seed/src/gtfs/proporPontos.ts --feed <pasta> --config <arquivo.json>
 *     --anterior <arquivo.json> --saida <pasta> [--sobrescrever]
 * Escreve pontos-proposta.json e pontos-proposta.txt. Código de saída: 0 escreveu; 2 uso errado ou arquivo ilegível (nada escrito).
 * Só `runCli` com `CliIo` injetado é testado; o disco de verdade fica no fim do arquivo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSeedFile, SeedFormatError } from "@notebus/domain/src/seedFormat.ts";
import { lerFeed } from "../../../gtfs/lib/gtfs.mjs";
import type { CliIo } from "./cli.ts";
import { parseNetworkConfig } from "./config.ts";
import { proposeStopTable, type StopProposal, type StopSource } from "./stopTable.ts";
import type { GtfsFeed, SeedFile } from "./types.ts";

const USAGE = "uso: --feed <pasta> --config <arquivo.json> --anterior <arquivo.json> --saida <pasta> [--sobrescrever]";
const VALUE_FLAGS = ["--feed", "--config", "--anterior", "--saida"];
const SOURCES: StopSource[] = ["codigo", "nome", "intervalo", "novo", "novo_sem_codigo"];

function summary(p: StopProposal): string {
  const lines = ["== Proposta da tabela de pontos (a pessoa valida; nada aqui está decidido) =="];
  for (const s of SOURCES) lines.push(`${s}: ${p.entries.filter((e) => e.source === s).length}`);
  lines.push(`pendentes: ${p.pending.length}`, `conflitos: ${p.conflicts.length}`);
  if (p.pending.length) {
    lines.push("", "== Pendentes ==");
    for (const x of p.pending) lines.push(`${x.pattern} posição ${x.position}: ${x.key} (${x.name}); candidatas: ${x.candidates.map((c) => `${c.stopId} [${c.code}] ${c.name}`).join("; ") || "nenhuma"}`);
  }
  if (p.conflicts.length) {
    lines.push("", "== Conflitos ==");
    for (const c of p.conflicts) lines.push(`${c.kind} ${c.id}: ${c.values.join(", ")}; ficou ${c.kept}`);
  }
  return `${lines.join("\n")}\n`;
}

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
  for (const f of VALUE_FLAGS) {
    if (!opt.has(f)) {
      io.err(`falta ${f}\n${USAGE}`);
      return 2;
    }
  }
  const jsonPath = path.join(opt.get("--saida")!, "pontos-proposta.json");
  const txtPath = path.join(opt.get("--saida")!, "pontos-proposta.txt");

  let feed: GtfsFeed;
  let config;
  let previous: SeedFile;
  try {
    const parsed = parseNetworkConfig(JSON.parse(io.readText(opt.get("--config")!)));
    if (!parsed.ok) {
      io.err(`configuração inválida:\n${parsed.problems.map((p) => `  - ${p}`).join("\n")}`);
      return 2;
    }
    config = parsed.config;
    feed = io.readFeed(opt.get("--feed")!);
    previous = parseSeedFile(JSON.parse(io.readText(opt.get("--anterior")!)));
  } catch (e) {
    io.err(`não foi possível ler: ${e instanceof SeedFormatError ? e.problems.join("; ") : (e as Error).message}`);
    return 2;
  }
  const taken = [jsonPath, txtPath].filter((p) => io.exists(p));
  if (taken.length && !overwrite) {
    io.err(`já existe (use --sobrescrever): ${taken.join(", ")}`);
    return 2;
  }

  const proposal = proposeStopTable(feed, config, previous);
  io.writeText(jsonPath, `${JSON.stringify({ stops: proposal.entries, pending: proposal.pending, conflicts: proposal.conflicts }, null, 2)}\n`);
  io.writeText(txtPath, summary(proposal));
  io.out(`escrito: ${jsonPath}\nescrito: ${txtPath}`);
  return 0;
}

// Entrada de verdade: não roda quando o arquivo é importado pelo teste.
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
