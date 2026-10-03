/** Ponto de entrada do gerador de seed da MOBILIS. */
/**
 * Ponto de entrada (CLI wrapper) para a ferramenta de geração e validação
 * dos arquivos JSON de dados da MOBILIS.
 */
import { join } from "node:path";
import { main } from "./cli.ts";

// Repassa o diretório raiz do monorepo para achar os fixtures e tabelas markdown.
process.exit(main(join(import.meta.dirname, "..", "..", "..")));
