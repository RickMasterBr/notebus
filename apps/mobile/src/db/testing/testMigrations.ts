/**
 * SÓ PARA TESTE. Estas migrações **não** estão em `migrations/index.ts` e não vão para o build publicado.
 * Servem para provar o mecanismo (§6.6, A6 e A7) enquanto o app só tem a versão 1.
 */
import type { Migration } from "../migrate";

/** Migração aditiva de exemplo: uma coluna opcional nova numa tabela real. */
export const testAdditiveMigration: Migration = {
  tag: "test_place_test_note",
  sql: "ALTER TABLE `place` ADD `test_note` text DEFAULT 'nova' NOT NULL;",
};

/** Quebra no meio (A7): o primeiro comando funciona, o segundo falha. */
export const testBrokenMigration: Migration = {
  tag: "test_broken",
  sql: [
    "CREATE TABLE `half_done` (`id` text PRIMARY KEY NOT NULL);",
    "INSERT INTO `place` (`id`, `created_at`, `updated_at`, `source`, `name`) VALUES ('meio', 1, 1, 'user', 'Meio');",
    "INSERT INTO `table_that_does_not_exist` VALUES (1);",
  ].join("\n--> statement-breakpoint\n"),
};
