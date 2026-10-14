/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 10 (L8, L12 e Item 4):
 * Confere o USO no texto-fonte de StopEditSheet.tsx, NearbyStops.tsx, StopSheet.tsx, AheadSheet.tsx, rideView.ts e TripSheet.tsx.
 * (Rolagem, teclado, toque e VoiceOver só o iPhone decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (...path: string[]) =>
  readFileSync(join(root, ...path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");

const stopEditSheet = read("sheets", "StopEditSheet.tsx");

describe("E-08.5 bloco 10 lacunas L8 e L12 (StopEditSheet.tsx)", () => {
  it("L8: useMemo(() => stopEditView({ ... locationChanged: locationView.changed ... }), [ ... ]) inclui locationView.changed nas dependências", () => {
    const match = stopEditSheet.match(
      /useMemo\(\s*\(\)\s*=>\s*stopEditView\(\{[\s\S]*?locationChanged:\s*locationView\.changed[\s\S]*?\}\),\s*\[([\s\S]*?)\],?\s*\)/,
    );
    expect(match, "L8: useMemo de stopEditView encontrado").not.toBeNull();
    const deps = match![1].split(",").map((s) => s.trim());
    expect(
      deps,
      "L8: dependências de stopEditView incluem locationView.changed",
    ).toContain("locationView.changed");
  });

  it("L12: load() do ramo de edição chama setLocationInfo({ lat: row.lat, lon: row.lon, locationSource: row.locationSource }) e setLocation(...) vem logo depois", () => {
    const loadIdx = stopEditSheet.indexOf("async function load()");
    expect(loadIdx, "L12: load() encontrado").toBeGreaterThan(-1);
    const loadSlice = stopEditSheet.slice(loadIdx, stopEditSheet.indexOf("void load();", loadIdx));
    expect(
      loadSlice,
      "L12: setLocationInfo({...}) recebe lat: row.lat, lon: row.lon e locationSource: row.locationSource no mesmo objeto, e setLocation(...) vem logo depois",
    ).toMatch(
      /setLocationInfo\(\{\s*lat:\s*row\.lat,\s*lon:\s*row\.lon,\s*locationSource:\s*row\.locationSource,?\s*\}\);\s*setLocation\(/,
    );
  });
});
