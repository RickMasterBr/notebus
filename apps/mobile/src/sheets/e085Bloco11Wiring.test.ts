/// <reference types="node" />
/**
 * Guarda de ligação do E-08.5 bloco 11 (Item 0): o `buildAhead` da Daqui para a frente roda dentro de `useMemo`
 * com as cinco dependências. (Fluidez da folha só o iPhone decide.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const aheadSheet = readFileSync(join(root, "sheets", "AheadSheet.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
  .replace(/\s+/g, " ");

describe("E-08.5 bloco 11 Item 0 (AheadSheet.tsx)", () => {
  it("const ahead = useMemo(() => ... buildAhead(...) ..., [schedule, tripId, position, registro.records, instant])", () => {
    const match = aheadSheet.match(/const ahead = useMemo\(\s*\(\)\s*=>[^;]*?buildAhead\([^;]*?:\s*null,\s*\[([^\]]*)\],?\s*\)/);
    expect(match, "useMemo de ahead com buildAhead encontrado").not.toBeNull();
    const deps = (match?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    expect(deps).toEqual(["schedule", "tripId", "position", "registro.records", "instant"]);
  });
});
