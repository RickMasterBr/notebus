/// <reference types="node" />
/**
 * Guarda estático da ligação do "Ir para" de lugar sem trajeto (ideia 68, contrato 07g).
 * GUARDA DE TEXTO: confere o código-fonte (uso), não o efeito no aparelho.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

function normalize(source: string): string {
  return stripComments(source).replace(/\s+/g, " ");
}

const gotoSrc = normalize(readFileSync(join(__dirname, "GotoSheet.tsx"), "utf8"));

describe("gotoNoRouteWiring: origem sem trajeto (ideia 68)", () => {
  it("GotoSheet importa originSelectorLabel e startsChoosingOrigin de ../data/gotoOriginHeader", () => {
    expect(gotoSrc).toContain(
      'import { originSelectorLabel, startsChoosingOrigin } from "../data/gotoOriginHeader";',
    );
  });

  it("o cabeçalho mostra o texto de originSelectorLabel(originPlace?.name)", () => {
    expect(gotoSrc).toContain("{originSelectorLabel(originPlace?.name)}");
  });

  it("o estado inicial de isChoosingOrigin vem de startsChoosingOrigin(initialOriginId, defaultOriginResolution.kind)", () => {
    expect(gotoSrc).toContain(
      "useState(() => startsChoosingOrigin(initialOriginId, defaultOriginResolution.kind),",
    );
  });

  it("o texto fixo antigo do seletor já não existe", () => {
    expect(gotoSrc).not.toContain('origin_label", { origin: originPlace?.name ?? "" })} ▾');
  });

  it("escolhida a origem, o botão Adicionar opção abre o editor com origem e destino", () => {
    expect(gotoSrc).toContain("onPress={() => void handleSelectOrigin(p.id)}");
    expect(gotoSrc).toContain("setUserSelectedOriginId(newOriginId);");
    expect(gotoSrc).toContain("originPlaceId: activeOriginId, destinationPlaceId,");
  });
});
