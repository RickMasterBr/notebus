import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MISSING_DATA_MESSAGE, main } from "./cli.ts";

it("sem docs/ diz onde estão os dados e sai com erro (E-01 §5.4)", () => {
  const out: string[] = [];
  const code = main(mkdtempSync(join(tmpdir(), "seed-")), () => {}, (s) => out.push(s));
  expect(code).toBe(1);
  expect(out).toEqual([MISSING_DATA_MESSAGE]);
});
