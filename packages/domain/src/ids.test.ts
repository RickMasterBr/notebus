import { describe, expect, it } from "vitest";
import { OFFICIAL_ID_NAMESPACE, officialId, uuidv5, uuidv7 } from "./ids";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuidv5", () => {
  it("bate com o valor de referência (python uuid.uuid5(NAMESPACE_DNS, 'www.example.com'))", () => {
    expect(uuidv5("www.example.com", DNS_NAMESPACE)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("codifica acentos em UTF-8", () => {
    // python: uuid.uuid5(uuid.NAMESPACE_DNS, 'Estação')
    expect(uuidv5("Estação", DNS_NAMESPACE)).toBe("62cd2837-e6e5-5598-b863-1cd58e55beab");
  });
});

describe("officialId (D-086)", () => {
  const key = "mobilis/2026-09-01/L1/ida/pos-2";

  it("o mesmo official_key dá sempre o mesmo ID", () => {
    expect(officialId(key)).toBe(officialId(key));
    expect(officialId(key)).toBe(uuidv5(key, OFFICIAL_ID_NAMESPACE));
  });

  it("o ID não muda entre versões do app (valor congelado, conferido com o uuid do Python)", () => {
    expect(officialId(key)).toBe("3e5200f5-29df-50c5-adb5-c07528aa8a7e");
  });

  it("official_keys diferentes dão IDs diferentes", () => {
    expect(officialId(key)).not.toBe(officialId("mobilis/2026-09-01/L1/ida/pos-3"));
  });

  it("recusa official_key vazio", () => {
    expect(() => officialId("")).toThrow();
  });
});

describe("uuidv7", () => {
  it("tem versão 7, variante RFC e o instante nos 48 primeiros bits", () => {
    const now = Date.UTC(2026, 9, 2, 7, 55);
    const id = uuidv7(now);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(now);
  });

  it("é ordenável por tempo", () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
  });
});
