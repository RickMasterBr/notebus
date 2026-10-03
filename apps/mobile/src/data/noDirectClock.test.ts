/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D-095: telas e dados pedem "agora" ao NowProvider; só o relógio real (clock.ts) e o NowProvider mencionam Date.now().
describe("relógio injetável", () => {
  it("nenhuma tela nem módulo de dados chama new Date() ou Date.now()", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const offenders: string[] = [];
    for (const dir of ["data", "sheets", "ui", "screens"]) {
      for (const name of readdirSync(join(root, dir))) {
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || name === "clock.ts" || name === "NowProvider.tsx") continue;
        const text = readFileSync(join(root, dir, name), "utf8");
        if (/new Date\(|Date\.now\(/.test(text)) offenders.push(`${dir}/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
