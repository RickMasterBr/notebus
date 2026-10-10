/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readNetworkInfo = () =>
  readFileSync(join(__dirname, "NetworkInfoSheet.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("NetworkInfoSheet: detalhe da rede (Item 7)", () => {
  it("exibe todos os campos requeridos só de leitura", () => {
    const src = readNetworkInfo();
    expect(src).toMatch(/network\.title/);
    expect(src).toMatch(/network\.file/);
    expect(src).toMatch(/network\.version/);
    expect(src).toMatch(/network\.imported_at/);
    expect(src).toMatch(/network\.checksum/);
    expect(src).toMatch(/network\.valid_from/);
    expect(src).toMatch(/selectable/);
  });

  it("não contém botão nem texto de verificar atualização (D-115)", () => {
    const src = readNetworkInfo();
    expect(src.toLowerCase()).not.toMatch(/verificar/);
    expect(src.toLowerCase()).not.toMatch(/atualiza/);
  });
});
