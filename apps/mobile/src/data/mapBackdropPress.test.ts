/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Analisa MapBackdrop.tsx e garante que o elemento <Map
 * contenha explicitamente onPress={handleMapPress}.
 */
export function checkMapBackdropPress(source: string): { ok: boolean; reason?: string } {
  const mapTagMatch = /<Map\b([\s\S]*?)>\s*<Camera/m.exec(source);
  if (!mapTagMatch) {
    return { ok: false, reason: "Elemento <Map> não encontrado no código" };
  }

  const mapProps = mapTagMatch[1] ?? "";
  const hasOnPressHandleMapPress = /\bonPress=\{\s*handleMapPress\s*\}/.test(mapProps);

  if (!hasOnPressHandleMapPress) {
    return {
      ok: false,
      reason: "Elemento <Map> não possui onPress={handleMapPress}",
    };
  }

  return { ok: true };
}

describe("guarda estático de onPress no <Map> em MapBackdrop.tsx (Item 1.2)", () => {
  it("MapBackdrop.tsx possui onPress={handleMapPress} no <Map>", () => {
    const filePath = join(__dirname, "../screens/MapBackdrop.tsx");
    const content = readFileSync(filePath, "utf8");
    const result = checkMapBackdropPress(content);
    expect(result.ok, result.reason).toBe(true);
  });

  it("falha quando <Map> não possui onPress={handleMapPress}", () => {
    const mock = `
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl}
      >
        <Camera />
      </Map>
    `;
    const result = checkMapBackdropPress(mock);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("onPress={handleMapPress}");
  });

  it("falha quando onPress recebe outra função ou thunk", () => {
    const mock = `<Map onPress={() => {}} logo={false}><Camera />`;
    const result = checkMapBackdropPress(mock);
    expect(result.ok).toBe(false);
  });
});
