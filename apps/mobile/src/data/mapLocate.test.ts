import { describe, expect, it } from "vitest";
import type { PositionFix } from "@notebus/domain";
import { waitForPositionFix, MAP_LOCATE_FIRST_FIX_TIMEOUT_MS } from "./mapLocate";

const FIX: PositionFix = {
  lat: 39.745,
  lon: -8.805,
  accuracyM: 20,
  atMs: 1_000_000,
};

describe("waitForPositionFix (Item 0.2)", () => {
  it("devolve fix imediatamente se já existe", async () => {
    let warmed = false;
    const fix = await waitForPositionFix({
      getFix: () => FIX,
      subscribeFix: () => () => {},
      warm: () => {
        warmed = true;
      },
    });
    expect(fix).toEqual(FIX);
    expect(warmed).toBe(false);
  });

  it("aguarda a primeira leitura e devolve quando ela chega antes do tempo", async () => {
    let currentFix: PositionFix | null = null;
    let warmed = false;
    const listeners: (() => void)[] = [];

    const fakeSleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    setTimeout(() => {
      currentFix = FIX;
      listeners.forEach((l) => l());
    }, 20);

    const fix = await waitForPositionFix({
      getFix: () => currentFix,
      subscribeFix: (fn) => {
        listeners.push(fn);
        return () => {};
      },
      warm: () => {
        warmed = true;
      },
      sleep: fakeSleep,
    });

    expect(warmed).toBe(true);
    expect(fix).toEqual(FIX);
  });

  it("aguarda até 3000 ms e devolve null se nenhuma leitura chegar", async () => {
    let waitedMs = 0;
    const fakeSleep = async (ms: number) => {
      waitedMs = ms;
    };

    const fix = await waitForPositionFix({
      getFix: () => null,
      subscribeFix: () => () => {},
      sleep: fakeSleep,
    });

    expect(waitedMs).toBe(MAP_LOCATE_FIRST_FIX_TIMEOUT_MS);
    expect(fix).toBeNull();
  });
});
