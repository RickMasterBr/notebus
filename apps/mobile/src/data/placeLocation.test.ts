import { describe, expect, it } from "vitest";
import { getPlaceLocation } from "./placeLocation";

describe("placeLocation: leitura isolada de localização", () => {
  it("retorna coordenadas quando o leitor tem sucesso", async () => {
    const mockReader = async () => ({ lat: 39.7436, lon: -8.8071 });
    const coords = await getPlaceLocation(mockReader);
    expect(coords).toEqual({ lat: 39.7436, lon: -8.8071 });
  });

  it("retorna null quando permissão é recusada ou leitor retorna null", async () => {
    const mockReader = async () => null;
    const coords = await getPlaceLocation(mockReader);
    expect(coords).toBeNull();
  });

  it("retorna null e não lança erro quando o leitor falha (exceção)", async () => {
    const mockReader = async () => {
      throw new Error("Permission denied");
    };
    const coords = await getPlaceLocation(mockReader);
    expect(coords).toBeNull();
  });
});
