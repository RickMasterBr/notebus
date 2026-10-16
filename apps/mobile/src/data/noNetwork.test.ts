import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NetworkBlockedError,
  installNoNetwork,
  isNoNetworkEnabled,
  restoreNetwork,
} from "./noNetwork";

describe("noNetwork (E-09 §3.4, T-92 a T-94)", () => {
  const originalEnv = process.env.EXPO_PUBLIC_NB_NO_NETWORK;
  const originalGlobalFetch = globalThis.fetch;

  beforeEach(() => {
    restoreNetwork();
  });

  afterEach(() => {
    restoreNetwork();
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_NB_NO_NETWORK;
    } else {
      process.env.EXPO_PUBLIC_NB_NO_NETWORK = originalEnv;
    }
    globalThis.fetch = originalGlobalFetch;
  });

  it("com a variável EXPO_PUBLIC_NB_NO_NETWORK=1, fetch lança NetworkBlockedError", async () => {
    process.env.EXPO_PUBLIC_NB_NO_NETWORK = "1";
    expect(isNoNetworkEnabled()).toBe(true);

    installNoNetwork();

    await expect(globalThis.fetch("https://example.com/tiles")).rejects.toThrow(
      NetworkBlockedError,
    );
    await expect(globalThis.fetch("https://example.com/tiles")).rejects.toThrow(
      /Requisição de rede bloqueada/,
    );
  });

  it("sem a variável (ou com outro valor), fetch original não é modificado", async () => {
    delete process.env.EXPO_PUBLIC_NB_NO_NETWORK;
    expect(isNoNetworkEnabled()).toBe(false);

    let dummyFetchCalled = false;
    globalThis.fetch = (async () => {
      dummyFetchCalled = true;
      return new Response("ok");
    }) as any;

    installNoNetwork();

    const res = await globalThis.fetch("https://example.com/test");
    expect(dummyFetchCalled).toBe(true);
    expect(await res.text()).toBe("ok");
  });

  it("restoreNetwork restaura o fetch anterior", async () => {
    process.env.EXPO_PUBLIC_NB_NO_NETWORK = "1";
    let mockCalled = false;
    globalThis.fetch = (async () => {
      mockCalled = true;
      return new Response("restored");
    }) as any;

    installNoNetwork();
    await expect(globalThis.fetch("https://example.com")).rejects.toThrow(NetworkBlockedError);

    restoreNetwork();
    const res = await globalThis.fetch("https://example.com");
    expect(mockCalled).toBe(true);
    expect(await res.text()).toBe("restored");
  });

  it("XMLHttpRequest também é bloqueado quando ativado", () => {
    process.env.EXPO_PUBLIC_NB_NO_NETWORK = "1";
    // Mock minimal XMLHttpRequest if not in browser
    if (!globalThis.XMLHttpRequest) {
      class FakeXHR {
        open() {}
        send() {}
      }
      globalThis.XMLHttpRequest = FakeXHR as any;
    }

    installNoNetwork();

    const xhr = new globalThis.XMLHttpRequest();
    expect(() => xhr.open("GET", "https://example.com")).toThrow(NetworkBlockedError);
  });
});
