/**
 * Migração só de build de teste (A6 e A7 da E-01). Ligada pela variável de build
 * `EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION` (`add_column` ou `fail`); sem ela (build normal), devolve lista vazia.
 * Não gera arquivo em `migrations/` e não entra em `migrations/index.ts`: as migrações reais ficam só aditivas e eternas.
 */
import type { Migration } from "./migrate";
import { testAdditiveMigration, testBrokenMigration } from "./testing/testMigrations";

export function testMigrationsFor(flag: string | undefined): readonly Migration[] {
  if (flag === "add_column") return [testAdditiveMigration];
  if (flag === "fail") return [testBrokenMigration];
  return [];
}
