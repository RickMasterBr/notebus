/// <reference types="node" />
/**
 * Guardas de ligação da E-09 bloco 1:
 * Item 3 (FN-4): o dia na lista de próximos avisos (AlarmsSheet).
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

const alarmsSheet = squash(read("sheets/AlarmsSheet.tsx"));

describe("e09Bloco1Wiring (Item 3: FN-4 na AlarmsSheet)", () => {
  it("FN-4: o JSX da lista consome u.dateText dentro do upcoming.map((u) =>", () => {
    // Regex ancorada: dentro do mapeamento de upcoming, u.dateText é consumido em um <Text antes de u.time
    expect(alarmsSheet).toMatch(
      /upcoming\.map\(\s*\(u\)\s*=>\s*\(?\s*<View\b[^>]*?key=\{u\.id\}[^>]*?>\s*<Text\b[^>]*?>\s*\{u\.dateText\}\s*<\/Text>\s*<Text\b[^>]*?>\s*\{u\.time\}\s*<\/Text>/,
    );
  });
});
