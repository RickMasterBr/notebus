import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dominio da propria pista, nao o da junção de node_modules (ideia 217). Ordem: o caminho profundo antes do exato.
const dominio = fileURLToPath(new URL("../../packages/domain", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@notebus\/domain\/(.*)$/, replacement: `${dominio}/$1` },
      { find: /^@notebus\/domain$/, replacement: `${dominio}/src/index.ts` },
    ],
  },
});
