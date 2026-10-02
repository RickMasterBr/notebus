import { existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(import.meta.dirname, "..", "..", "..", "docs", "dados", "mobilis");

if (!existsSync(dataDir)) {
  console.error(
    "Os dados da MOBILIS não estão neste repositório. Clone o repositório privado em docs/ " +
      "(docs/dados/mobilis/) e rode de novo.",
  );
  process.exit(1);
}

// A lógica de geração e validação é do bloco 3.
