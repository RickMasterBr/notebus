/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export interface HomeOfflineCardGuardViolations {
  usesUseOfflineMap: boolean;
  rendersOfflineMapCard: boolean;
}

/**
 * Analisa HomeSheet.tsx e verifica se:
 * - usa o hook `useOfflineMap`
 * - renderiza o componente `<OfflineMapCard`
 */
export function checkHomeSheetOfflineCard(source: string): HomeOfflineCardGuardViolations {
  return {
    usesUseOfflineMap: /\buseOfflineMap\s*\(/.test(source),
    rendersOfflineMapCard: /<OfflineMapCard\b/.test(source),
  };
}

describe("guarda estático do cartão de mapa offline em HomeSheet.tsx (Item 2)", () => {
  it("HomeSheet.tsx usa useOfflineMap e renderiza <OfflineMapCard />", () => {
    const filePath = join(__dirname, "./HomeSheet.tsx");
    const content = readFileSync(filePath, "utf8");
    const result = checkHomeSheetOfflineCard(content);
    expect(result.usesUseOfflineMap, "Falta chamar useOfflineMap() em HomeSheet.tsx").toBe(true);
    expect(result.rendersOfflineMapCard, "Falta renderizar <OfflineMapCard /> em HomeSheet.tsx").toBe(true);
  });

  it("falha quando useOfflineMap não é chamado", () => {
    const mock = `
      export function HomeSheet() {
        return <View><OfflineMapCard /></View>;
      }
    `;
    const result = checkHomeSheetOfflineCard(mock);
    expect(result.usesUseOfflineMap).toBe(false);
    expect(result.rendersOfflineMapCard).toBe(true);
  });

  it("falha quando <OfflineMapCard /> não é renderizado", () => {
    const mock = `
      export function HomeSheet() {
        const offlineMap = useOfflineMap();
        return <View></View>;
      }
    `;
    const result = checkHomeSheetOfflineCard(mock);
    expect(result.usesUseOfflineMap).toBe(true);
    expect(result.rendersOfflineMapCard).toBe(false);
  });
});
