import { defineConfig } from "vitest/config";

// Valores iguais aos que o gate passa por linha de comando (m3-i2, D-320):
// a suite do app tem testes de prazo fixo (5 s padrao; 50 ms nos de desempenho) que falham sob paralelismo total.
export default defineConfig({
  test: {
    testTimeout: 20000,
    maxWorkers: 2,
  },
});
