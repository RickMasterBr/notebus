/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (url: URL) =>
  readFileSync(url, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\/|(^|[\s;{(,])\/\/.*$/gm, "$1");

describe("E-09 Bloco 39 · fiação de abertura única do banco e semente de teste", () => {
  it("(a) index.ts não contém runTestSeedIfNeeded", () => {
    const text = strip(new URL("../../index.ts", import.meta.url));
    expect(text).not.toContain("runTestSeedIfNeeded");
  });

  it("(b) testSeed.ts não exporta runTestSeedIfNeeded nem importa ./open", () => {
    const text = strip(new URL("./testSeed.ts", import.meta.url));
    expect(text).not.toMatch(/export\s+(async\s+)?function\s+runTestSeedIfNeeded/);
    expect(text).not.toContain("runTestSeedIfNeeded");
    expect(text).not.toContain("./open");
  });

  it("(c) em open.ts, migrateProtected vem antes de seedTestDatabase e antes do return { db: drizzle, sob condição com isTestSeedEnabled() e migration.status !== 'failed'", () => {
    const text = strip(new URL("./open.ts", import.meta.url));
    const migrateIdx = text.indexOf("migrateProtected(");
    const seedIdx = text.indexOf("seedTestDatabase(");
    const returnIdx = text.indexOf("return { db: drizzle");

    expect(migrateIdx, "migrateProtected(").toBeGreaterThanOrEqual(0);
    expect(seedIdx, "seedTestDatabase(").toBeGreaterThanOrEqual(0);
    expect(returnIdx, "return { db: drizzle").toBeGreaterThanOrEqual(0);

    expect(migrateIdx, "migrateProtected antes de seedTestDatabase").toBeLessThan(seedIdx);
    expect(seedIdx, "seedTestDatabase antes de return").toBeLessThan(returnIdx);

    const between = text.slice(migrateIdx, seedIdx);
    expect(between).toContain("isTestSeedEnabled()");
    expect(between).toContain('migration.status !== "failed"');
  });

  it("(d) MigrationNotice.tsx renderiza detail só dentro de detail ? ou detail && e App.tsx só passa detail com isTestSeedEnabled()", () => {
    const noticeText = strip(new URL("../ui/MigrationNotice.tsx", import.meta.url));
    const appText = strip(new URL("../../App.tsx", import.meta.url));

    const hasConditional = /detail\s*\?|detail\s*&&/.test(noticeText);
    expect(hasConditional, "MigrationNotice deve ter detail condicional").toBe(true);

    expect(appText).toMatch(/detail=\{[^}]*isTestSeedEnabled\(\)[^}]*\}/);
  });
});
