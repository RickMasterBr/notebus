/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Analisa o componente MapBackdrop.tsx e garante que o elemento <Map
 * contenha explicitamente doubleTapZoom={false}.
 */
export function checkMapDoubleTapZoom(source: string): { ok: boolean; reason?: string } {
  // Encontra a tag de abertura <Map ... >
  const mapTagMatch = /<Map\b([\s\S]*?)>\s*<Camera/m.exec(source);
  if (!mapTagMatch) {
    return { ok: false, reason: "Elemento <Map> não encontrado no código" };
  }

  const mapProps = mapTagMatch[1] ?? "";
  const hasDoubleTapZoomFalse = /\bdoubleTapZoom=\{\s*false\s*\}/.test(mapProps);

  if (!hasDoubleTapZoomFalse) {
    return {
      ok: false,
      reason: "Elemento <Map> não possui a propriedade doubleTapZoom={false}",
    };
  }

  return { ok: true };
}

describe("guarda estático de doubleTapZoom no <Map> (Item 0)", () => {
  it("MapBackdrop.tsx possui doubleTapZoom={false} no <Map>", () => {
    const filePath = join(__dirname, "../screens/MapBackdrop.tsx");
    const content = readFileSync(filePath, "utf8");
    const result = checkMapDoubleTapZoom(content);
    expect(result.ok, result.reason).toBe(true);
  });

  it("falha quando <Map> não possui doubleTapZoom={false}", () => {
    const mock = `
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl}
        logo={false}
      >
        <Camera />
      </Map>
    `;
    const result = checkMapDoubleTapZoom(mock);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("doubleTapZoom={false}");
  });

  it("falha quando doubleTapZoom é true", () => {
    const mock = `<Map doubleTapZoom={true} logo={false}><Camera />`;
    const result = checkMapDoubleTapZoom(mock);
    expect(result.ok).toBe(false);
  });
});
