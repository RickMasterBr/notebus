import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN = ["ℹ", "✓", "✔", "⚠", "❗", "\uFE0F"];

function getTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("noEmojiGlyph", () => {
  it("nenhum arquivo .tsx em sheets e ui contém emojis ou variation selector 16", () => {
    const sheetsDir = join(__dirname, "../sheets");
    const uiDir = join(__dirname, "../ui");
    const files = [...getTsxFiles(sheetsDir), ...getTsxFiles(uiDir)];

    const violations: { file: string; char: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const char of FORBIDDEN) {
        if (content.includes(char)) {
          violations.push({ file, char });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
