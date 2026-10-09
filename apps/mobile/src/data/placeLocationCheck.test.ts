// Conferência da leitura "Usar minha localização agora" no lugar (A6, T-70). Coordenadas de Leiria e Lisboa são públicas.
import { describe, expect, it } from "vitest";
import { checkPlaceLocation } from "./placeLocation";

const LEIRIA = { lat: 39.7436, lon: -8.8071 };

describe("checkPlaceLocation", () => {
  it("precisão 20 m em Leiria → ok", () => {
    expect(checkPlaceLocation({ ...LEIRIA, accuracyM: 20 })).toEqual({ kind: "ok" });
  });
  it("precisão 80 m → imprecisa", () => {
    expect(checkPlaceLocation({ ...LEIRIA, accuracyM: 80 })).toEqual({ kind: "imprecise", accuracyM: 80 });
  });
  it("precisão desconhecida (null ou ausente) → imprecisa", () => {
    expect(checkPlaceLocation({ ...LEIRIA, accuracyM: null })).toEqual({ kind: "imprecise", accuracyM: null });
    expect(checkPlaceLocation(LEIRIA)).toEqual({ kind: "imprecise", accuracyM: null });
  });
  it("Lisboa com 20 m → longe", () => {
    expect(checkPlaceLocation({ lat: 38.72, lon: -9.14, accuracyM: 20 })).toEqual({ kind: "far" });
  });
  it("(0, 0) → inválida", () => {
    expect(checkPlaceLocation({ lat: 0, lon: 0, accuracyM: 20 })).toEqual({ kind: "invalid" });
  });
  it("latitude 95 → inválida", () => {
    expect(checkPlaceLocation({ lat: 95, lon: -8.8, accuracyM: 20 })).toEqual({ kind: "invalid" });
  });
});
