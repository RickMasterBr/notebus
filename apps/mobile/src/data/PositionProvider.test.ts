import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePositionPort } from "./devicePosition.fake";
import { READ_TIMEOUT_MS, createPositionStore } from "./positionStore";

const fix = (lat: number) => ({ lat, lon: -8.8, accuracyM: 10, atMs: 1_000 });

describe("positionStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("o aquecimento pede uma vez e guarda a posição", async () => {
    const port = createFakePositionPort({ next: fix(39.7) });
    const store = createPositionStore(port);
    expect(store.getFix()).toBeNull();
    await store.warm();
    expect(port.reads).toBe(1);
    expect(store.getFix()?.lat).toBe(39.7);
  });

  it("duas chamadas seguidas não duplicam o pedido", async () => {
    const port = createFakePositionPort({ next: fix(39.7) });
    const store = createPositionStore(port);
    await Promise.all([store.warm(), store.warm()]);
    expect(port.reads).toBe(1);
  });

  it("sem permissão não pede nada", async () => {
    for (const permissionState of ["denied", "undetermined"] as const) {
      const port = createFakePositionPort({ permissionState, next: fix(39.7) });
      const store = createPositionStore(port);
      await store.warm();
      expect(port.reads).toBe(0);
      expect(store.getFix()).toBeNull();
    }
  });

  it("port que nunca responde não trava: o valor anterior continua e depois do limite pede de novo", async () => {
    const port = createFakePositionPort({ next: fix(39.7) });
    const store = createPositionStore(port);
    await store.warm();
    port.next = "never";
    const hung = store.warm();
    expect(store.getFix()?.lat).toBe(39.7); // na hora
    await store.warm(); // em andamento: não duplica
    expect(port.reads).toBe(2);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    await hung;
    expect(store.getFix()?.lat).toBe(39.7);
    port.next = fix(39.8);
    await store.warm();
    expect(store.getFix()?.lat).toBe(39.8);
  });

  it("erro vira nada, sem lançar, e a posição anterior fica", async () => {
    const port = createFakePositionPort({ next: fix(39.7) });
    const store = createPositionStore(port);
    await store.warm();
    port.next = "throw";
    await expect(store.warm()).resolves.toBeUndefined();
    expect(store.getFix()?.lat).toBe(39.7);
  });

  it("askOnce pede a permissão uma vez; negar não pede de novo", async () => {
    const port = createFakePositionPort({ permissionState: "undetermined", requestResult: "denied" });
    const store = createPositionStore(port);
    store.askOnce();
    store.askOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(port.requests).toBe(1);
    port.permissionState = "undetermined";
    store.askOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(port.requests).toBe(1);
  });

  it("askOnce não pede se a permissão já foi decidida; ao conceder, aquece", async () => {
    const decided = createFakePositionPort({ permissionState: "granted" });
    createPositionStore(decided).askOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(decided.requests).toBe(0);

    const port = createFakePositionPort({ permissionState: "undetermined", next: fix(39.7) });
    const store = createPositionStore(port);
    store.askOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(port.requests).toBe(1);
    expect(store.getFix()?.lat).toBe(39.7);
  });
});
