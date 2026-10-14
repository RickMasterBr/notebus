/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 13:
 * Item 1: SheetHost passa entry.initialStop para LineEditSheet; LineEditSheet usa initialLineFormState(initialStop).
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

const sheetHost = squash(read("sheets/SheetHost.tsx"));
const lineEditSheet = squash(read("sheets/LineEditSheet.tsx"));

describe("e085Bloco13Wiring (Item 1)", () => {
  it("o desvio do SheetHost passa entry.initialStop para LineEditSheet", () => {
    expect(sheetHost).toContain(
      'if (entry.kind === "lineDetail" && entry.lineId === NEW_LINE_ID && entry.initialStop) { return <LineEditSheet id={entry.id} initialStop={entry.initialStop} />;'
    );
  });

  it("o LineEditSheet usa initialLineFormState( com o argumento initialStop", () => {
    expect(lineEditSheet).toMatch(/useState<LineFormState>\(\s*\(\)\s*=>\s*initialLineFormState\(initialStop\)\s*\)/);
  });
});
