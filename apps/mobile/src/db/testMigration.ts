/** Utilitários para carregar migrações específicas de teste mediante flags de build. */
/**
 * Migração só de build de teste (A6 e A7 da E-01). Ligada pela variável de build
 * `EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION` (`add_column` ou `fail`); sem ela (build normal), devolve lista vazia.
 * Não gera arquivo em `migrations/` e não entra em `migrations/index.ts`: as migrações reais ficam só aditivas e eternas.
 */
import type { Migration } from "./migrate";
import { testAdditiveMigration, testBrokenMigration } from "./testing/testMigrations";

/**
 * Retorna as migrações de teste conforme a flag passada no momento da build.
 * Se nenhuma flag for definida, retorna array vazio (o padrão para builds de produção).
 *
 * @param flag Valor de EXPO_PUBLIC_NOTEBUS_TEST_MIGRATION
 */
export function testMigrationsFor(flag: string | undefined): readonly Migration[] {
  if (flag === "add_column") return [testAdditiveMigration];
  if (flag === "fail") return [testBrokenMigration];
  return [];
}
