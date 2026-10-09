import { describe, expect, it } from "vitest";
import { createExpoPositionPort, normalizeFix } from "./devicePosition";

const base = { latitude: 39.74, longitude: -8.8, accuracy: 12, timestamp: 1_790_000_000_000 };

describe("normalizeFix", () => {
  it("timestamp em ms fica como está", () => {
    expect(normalizeFix(base)).toEqual({ lat: 39.74, lon: -8.8, accuracyM: 12, atMs: 1_790_000_000_000 });
  });
  it("timestamp em segundos vira ms", () => {
    expect(normalizeFix({ ...base, timestamp: 1_790_000_000 })?.atMs).toBe(1_790_000_000_000);
  });
  it("precisão ausente, negativa ou NaN vira null", () => {
    expect(normalizeFix({ ...base, accuracy: null })?.accuracyM).toBeNull();
    expect(normalizeFix({ ...base, accuracy: -1 })?.accuracyM).toBeNull();
    expect(normalizeFix({ ...base, accuracy: NaN })?.accuracyM).toBeNull();
  });
  it("coordenada fora da faixa ou não finita devolve null", () => {
    expect(normalizeFix({ ...base, latitude: 91 })).toBeNull();
    expect(normalizeFix({ ...base, longitude: -181 })).toBeNull();
    expect(normalizeFix({ ...base, latitude: NaN })).toBeNull();
    expect(normalizeFix({ ...base, longitude: Infinity })).toBeNull();
  });
  it("o par (0, 0) devolve null", () => {
    expect(normalizeFix({ ...base, latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe("createExpoPositionPort", () => {
  const failing = () => {
    throw new Error("módulo nativo ausente");
  };
  it("sem módulo ou com erro: read devolve null, permissão negada, sem lançar", async () => {
    const port = createExpoPositionPort(() => 0, failing);
    await expect(port.read()).resolves.toBeNull();
    await expect(port.permission()).resolves.toBe("denied");
    await expect(port.request()).resolves.toBe("denied");
  });
  it("módulo cuja leitura rejeita: null", async () => {
    const mod = {
      getLastKnownPositionAsync: async () => null,
      getCurrentPositionAsync: async () => {
        throw new Error("sem sinal");
      },
      Accuracy: { Balanced: 3 },
    } as never;
    await expect(createExpoPositionPort(() => 0, () => mod).read()).resolves.toBeNull();
  });
  it("última posição recente: usa ela sem pedir uma nova", async () => {
    let asked = false;
    const mod = {
      getLastKnownPositionAsync: async () => ({ coords: { latitude: 39.7, longitude: -8.8, accuracy: 10 }, timestamp: 1_000_000 }),
      getCurrentPositionAsync: async () => {
        asked = true;
        return null;
      },
      Accuracy: { Balanced: 3 },
    } as never;
    const fix = await createExpoPositionPort(() => 1_030_000, () => mod).read();
    expect(fix?.lat).toBe(39.7);
    expect(asked).toBe(false);
  });
});
