import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { testMigrationsFor } from "./testMigration";
import { testAdditiveMigration, testBrokenMigration } from "./testing/testMigrations";

describe("migração de teste (variável de build)", () => {
  it("sem variável, ou com valor desconhecido, não faz nada", () => {
    expect(testMigrationsFor(undefined)).toEqual([]);
    expect(testMigrationsFor("")).toEqual([]);
    expect(testMigrationsFor("qualquer")).toEqual([]);
  });
  it("add_column e fail ligam as migrações de teste (já cobertas em migrate.test.ts: A6 e A7)", () => {
    expect(testMigrationsFor("add_column")).toEqual([testAdditiveMigration]);
    expect(testMigrationsFor("fail")).toEqual([testBrokenMigration]);
  });
  it("as migrações reais não contêm a de teste", () => {
    const tags = migrations.map((m) => m.tag);
    expect(tags).not.toContain(testAdditiveMigration.tag);
    expect(tags).not.toContain(testBrokenMigration.tag);
  });
});
