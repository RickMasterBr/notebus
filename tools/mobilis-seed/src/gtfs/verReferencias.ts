/**
 * Linha de comando do relatório das referências pessoais (só leitura do backup e dos dois arquivos de rede):
 *   node --experimental-strip-types tools/mobilis-seed/src/gtfs/verReferencias.ts --backup <backup.json>
 *     --anterior <arquivo.json> --novo <arquivo.json> --saida <pasta> [--sobrescrever]
 * Código de saída: 0 escreveu `referencias.txt` (mesmo com REVER); 2 uso errado ou arquivo ilegível (nada escrito).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseSeedFile, SeedFormatError } from "@notebus/domain/src/seedFormat.ts";
import { checkReferences, type BackupTables } from "./referencias.ts";
import type { SeedFile } from "./types.ts";

export interface CliIo {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
  out(s: string): void;
  err(s: string): void;
}

const USAGE = "uso: --backup <backup.json> --anterior <arquivo.json> --novo <arquivo.json> --saida <pasta> [--sobrescrever]";
const VALUE_FLAGS = ["--backup", "--anterior", "--novo", "--saida"];

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

  // tudo que pode falhar por arquivo vem antes de qualquer escrita
  let tables: BackupTables;
  let previous: SeedFile;
  let next: SeedFile;
  try {
    const backup = JSON.parse(io.readText(opt.get("--backup")!)) as { tables?: unknown };
    if (!backup || typeof backup.tables !== "object" || backup.tables === null || Array.isArray(backup.tables)) throw new Error("o backup não tem `tables`");
    tables = backup.tables as BackupTables;
    previous = parseSeedFile(JSON.parse(io.readText(opt.get("--anterior")!)));
    next = parseSeedFile(JSON.parse(io.readText(opt.get("--novo")!)));
  } catch (e) {
    io.err(`não foi possível ler: ${e instanceof SeedFormatError ? e.problems.join("; ") : (e as Error).message}`);
    return 2;
  }
  const target = path.join(opt.get("--saida")!, "referencias.txt");
  if (io.exists(target) && !overwrite) {
    io.err(`já existe (use --sobrescrever): ${target}`);
    return 2;
  }
  io.writeText(target, checkReferences(tables, previous, next).texto);
  io.out(`escrito: ${target}`);
  return 0;
}

// Entrada de verdade (node ... verReferencias.ts): não roda quando o arquivo é importado pelo teste.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2), {
    readText: (p) => readFileSync(p, "utf8"),
    writeText: (p, t) => writeFileSync(p, t),
    exists: (p) => existsSync(p),
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  });
}
