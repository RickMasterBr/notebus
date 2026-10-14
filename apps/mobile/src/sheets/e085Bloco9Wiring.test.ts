/// <reference types="node" />
/**
 * Guardas de ligação do E-08.5 bloco 9 (Item 2):
 * Confere memoização de StopRow e LineRow e callbacks estáveis de onDelete em NetworkSheet.tsx.
 * (Rolagem, renderização nativa e VoiceOver só o iPhone decide).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.env.NB_WIRING_ROOT ?? join(__dirname, "..");

const read = (rel: string) =>
  readFileSync(join(root, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const squash = (text: string) => text.replace(/\s+/g, " ");

const networkSheet = squash(read("sheets/NetworkSheet.tsx"));

describe("E-08.5 bloco 9 guardas de ligação (NetworkSheet.tsx)", () => {
  it("StopRow e LineRow declarados com memo(", () => {
    expect(networkSheet).toMatch(/const StopRow = memo\(function StopRow\(/);
    expect(networkSheet).toMatch(/const LineRow = memo\(function LineRow\(/);
  });

  it("<StopRow recebe onDelete={handleStopDelete} e <LineRow recebe onDelete={handleLineDelete}", () => {
    expect(networkSheet).toContain("<StopRow stop={item.stop} onPress={handleStopPress} onDelete={handleStopDelete}");
    expect(networkSheet).toContain("<LineRow line={item.line} onPress={handleLinePress} onDelete={handleLineDelete}");
  });

  it("handleStopDelete e handleLineDelete são useCallback que chamam handleDelete / handleDeleteLine com a dependência correta", () => {
    const stopMatch = networkSheet.match(/const handleStopDelete = useCallback\(\(stop: NetworkStopItem\) => \{ void handleDelete\(stop\); \}, \[([^\]]*)\]\);/);
    expect(stopMatch, "handleStopDelete não achado ou corpo incorreto").not.toBeNull();
    const stopDeps = stopMatch![1]!.split(",").map((d) => d.trim());
    expect(stopDeps).toContain("handleDelete");

    const lineMatch = networkSheet.match(/const handleLineDelete = useCallback\(\(line: NetworkLineItem\) => \{ void handleDeleteLine\(line\); \}, \[([^\]]*)\]\);/);
    expect(lineMatch, "handleLineDelete não achado ou corpo incorreto").not.toBeNull();
    const lineDeps = lineMatch![1]!.split(",").map((d) => d.trim());
    expect(lineDeps).toContain("handleDeleteLine");
  });
});
