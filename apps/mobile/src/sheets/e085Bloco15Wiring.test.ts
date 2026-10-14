/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 15:
 * Item 0: SearchSheet passa index.status === "ready" ? index.stops.length : null ao searchEmpty.
 * Item 3: Ajustes como índice e páginas (SettingsSheet).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1");

const squash = (text: string) => text.replace(/\s+/g, " ");

const searchSheet = squash(read("sheets/SearchSheet.tsx"));

describe("e085Bloco15Wiring (Item 0)", () => {
  it("a SearchSheet passa index.status === 'ready' ? index.stops.length : null ao searchEmpty", () => {
    expect(searchSheet).toMatch(
      /searchEmpty\(\{[\s\S]*?stopTotal:\s*index\.status\s*===\s*"ready"\s*\?\s*index\.stops\.length\s*:\s*null/,
    );
  });
});
