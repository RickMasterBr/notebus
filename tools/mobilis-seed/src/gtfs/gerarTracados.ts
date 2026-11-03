/**
 * Linha de comando dos traçados (só lê o feed, grava um arquivo):
 *   node --experimental-strip-types tools/mobilis-seed/src/gtfs/gerarTracados.ts --feed <pasta> --corte AAAA-MM-DD --saida <pasta> [--sobrescrever]
 * Código de saída: 0 gravou (mesmo com avisos); 2 uso errado, arquivo do feed ausente, erro de escolha ou de forma, ou arquivo existente (nada gravado).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chooseShapes, parseCsv, serializeShapes, simplifyShape, TracadoErro, type Forma, type Problema, type Row } from "./tracados.ts";

export interface CliIo {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
  out(s: string): void;
  err(s: string): void;
}

const USAGE = "uso: --feed <pasta> --corte AAAA-MM-DD --saida <pasta> [--sobrescrever]";
const VALUE_FLAGS = ["--feed", "--corte", "--saida"];
const ARQUIVOS = ["routes.txt", "trips.txt", "stop_times.txt", "shapes.txt"];

function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
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
  const corte = opt.get("--corte")!;
  if (!dataValida(corte)) {
    io.err(`--corte não é uma data válida (AAAA-MM-DD): ${corte}`);
    return 2;
  }

  // tudo que pode falhar vem antes de qualquer escrita
  const feed = opt.get("--feed")!;
  const tabelas: Row[][] = [];
  for (const nome of ARQUIVOS) {
    const p = path.join(feed, nome);
    if (!io.exists(p)) {
      io.err(`arquivo do feed ausente: ${p}`);
      return 2;
    }
    try {
      tabelas.push(parseCsv(io.readText(p)));
    } catch (e) {
      io.err(`não foi possível ler ${p}: ${(e as Error).message}`);
      return 2;
    }
  }
  const [routes, trips, stopTimes, shapes] = tabelas as [Row[], Row[], Row[], Row[]];

  const escolha = chooseShapes(routes, trips, stopTimes, shapes);
  const mostra = (p: Problema) => `${p.codigo} rota ${p.rota}${p.detalhe ? ` (${p.detalhe})` : ""}`;
  if (escolha.erros.length > 0) {
    for (const e of escolha.erros) io.err(mostra(e));
    return 2;
  }
  const formas: Forma[] = [];
  const resumo: string[] = [];
  for (const e of escolha.escolhas) {
    const linhas = shapes.filter((s) => s.shape_id === e.forma);
    try {
      const pontos = simplifyShape(linhas);
      formas.push({ ...e, pontos });
      resumo.push(`linha ${e.linha} (rota ${e.rota}, forma ${e.forma}): ${linhas.length} -> ${pontos.length} pontos`);
    } catch (err) {
      if (!(err instanceof TracadoErro)) throw err;
      io.err(`rota ${e.rota} (forma ${e.forma}): ${err.message}`);
      return 2;
    }
  }
  const alvo = path.join(opt.get("--saida")!, `mobilis-${corte}.shapes.json`);
  if (io.exists(alvo) && !overwrite) {
    io.err(`já existe (use --sobrescrever): ${alvo}`);
    return 2;
  }
  io.writeText(alvo, serializeShapes(formas));
  for (const l of resumo) io.out(l);
  for (const a of escolha.avisos) io.out(`aviso: ${mostra(a)}, pulada`);
  io.out(`escrito: ${alvo}`);
  return 0;
}

// Entrada de verdade: não roda quando o arquivo é importado pelo teste.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2), {
    readText: (p) => readFileSync(p, "utf8"),
    writeText: (p, t) => writeFileSync(p, t),
    exists: (p) => existsSync(p),
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  });
}
