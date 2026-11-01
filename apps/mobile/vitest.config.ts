import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dominio da propria pista, nao o da junção de node_modules (ideia 217). Ordem: o caminho profundo antes do exato.
const dominio = fileURLToPath(new URL("../../packages/domain", import.meta.url));

// Valores iguais aos que o gate passa por linha de comando (m3-i2, D-320):
// a suite do app tem testes de prazo fixo (5 s padrao; 50 ms nos de desempenho) que falham sob paralelismo total.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@notebus\/domain\/(.*)$/, replacement: `${dominio}/$1` },
      { find: /^@notebus\/domain$/, replacement: `${dominio}/src/index.ts` },
    ],
  },
  test: {
    testTimeout: 20000,
    maxWorkers: 2,
  },
});
