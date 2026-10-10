/// <reference types="node" />
/**
 * Guarda estático de fiação das folhas de rede (TL-11, E-08 bloco 1c, Item 5).
 * Confere as linhas de ligação e a presença das chaves de tradução no catálogo.
 * GUARDA DE TEXTO: confere o código-fonte (uso e fiação), não o efeito em tela montada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "../i18n/pt-BR";

const read = (rel: string) =>
  readFileSync(join(__dirname, "..", rel), "utf8").replace(/\r\n/g, "\n");

const settingsSheet = read("sheets/SettingsSheet.tsx");
const networkSheet = read("sheets/NetworkSheet.tsx");
const lineDetailSheet = read("sheets/LineDetailSheet.tsx");
const sheetHost = read("sheets/SheetHost.tsx");

describe("networkWiring: fiação das folhas de rede (Item 5)", () => {
  it("SettingsSheet empilha { kind: 'network' }", () => {
    expect(settingsSheet).toMatch(
      /dispatch\(\{\s*type:\s*"push",\s*sheet:\s*\{\s*kind:\s*"network"\s*\}\s*\}\)/,
    );
  });

  it("NetworkSheet empilha lineDetail e stop", () => {
    expect(networkSheet).toMatch(
      /dispatch\(\{\s*type:\s*"push",\s*sheet:\s*\{\s*kind:\s*"lineDetail",\s*lineId\s*\}\s*\}\)/,
    );
    expect(networkSheet).toMatch(
      /dispatch\(\{\s*type:\s*"push",\s*sheet:\s*\{\s*kind:\s*"stop",\s*stopId,\s*name\s*\}\s*\}\)/,
    );
  });

  it("LineDetailSheet empilha stop e altera o tipo de dia nos chips", () => {
    expect(lineDetailSheet).toMatch(
      /dispatch\(\{\s*type:\s*"push",\s*sheet:\s*\{\s*kind:\s*"stop",\s*stopId,\s*name\s*\}\s*\}\)/,
    );
    expect(lineDetailSheet).toMatch(/setSelectedDayType\("weekday"\)/);
    expect(lineDetailSheet).toMatch(/setSelectedDayType\("saturday"\)/);
    expect(lineDetailSheet).toMatch(/setSelectedDayType\("sunday_holiday"\)/);
  });

  it("SheetHost tem os casos network e lineDetail", () => {
    expect(sheetHost).toMatch(
      /case\s+"network":\s*\n\s*return\s+<NetworkSheet\s+id=\{entry\.id\}\s*\/>;/,
    );
    expect(sheetHost).toMatch(
      /case\s+"lineDetail":\s*\n\s*return\s+<LineDetailSheet\s+id=\{entry\.id\}\s+lineId=\{entry\.lineId\}\s*\/>;/,
    );
  });

  it("todas as chaves net.* e network.unknown existem no catálogo pt-BR", () => {
    const requiredKeys = [
      "settings.network.row",
      "net.title",
      "net.section.lines",
      "net.section.stops",
      "net.line.patterns_one",
      "net.line.patterns_other",
      "net.line.a11y",
      "net.stop.a11y",
      "net.stop.id",
      "net.stop.aliases",
      "net.official",
      "net.empty.lines",
      "net.empty.stops",
      "net.empty.line",
      "net.error",
      "net.pattern.circular",
      "net.pattern.stops_one",
      "net.pattern.stops_other",
      "net.pattern.control",
      "net.times.title",
      "net.times.valid_from",
      "net.times.at",
      "net.times.empty",
      "net.times.partial_note",
      "network.unknown",
    ];

    for (const key of requiredKeys) {
      expect(key in ptBR, `chave ausente no catálogo: ${key}`).toBe(true);
    }
  });
});
