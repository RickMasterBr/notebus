/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED_MAPLIBRE_IMPORTERS = new Set([
  "screens/MapBackdrop.tsx",
  "data/mapOfflineNative.ts",
]);

function findSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findSourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

export function findMapLibreViolations(srcDir: string): string[] {
  const files = findSourceFiles(srcDir);
  const regex = /from\s+["']@maplibre\/maplibre-react-native["']|require\(\s*["']@maplibre\/maplibre-react-native["']\s*\)/;

  return files
    .map((file) => relative(srcDir, file).replace(/\\/g, "/"))
    .filter((relPath) => !ALLOWED_MAPLIBRE_IMPORTERS.has(relPath))
    .filter((relPath) => {
      const content = readFileSync(join(srcDir, relPath), "utf8");
      // Remove comentários para evitar falsos positivos
      const clean = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      return regex.test(clean);
    });
}

describe("guarda de imports do MapLibre (Item 0)", () => {
  it("somente MapBackdrop.tsx e mapOfflineNative.ts importam @maplibre/maplibre-react-native", () => {
    const srcDir = join(__dirname, "..");
    const violations = findMapLibreViolations(srcDir);
    expect(violations).toEqual([]);
  });
});
