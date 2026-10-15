import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@maplibre/maplibre-react-native", () => ({
  OfflineManager: {
    getPacks: vi.fn().mockResolvedValue([]),
    deletePack: vi.fn().mockResolvedValue(undefined),
    setTileCountLimit: vi.fn(),
    createPack: vi.fn(),
  },
}));

import {
  checkNetworkConnectivity,
  OFFLINE_CHECK_TIMEOUT_MS,
  startOfflineMapDownload,
} from "./mapOfflineNative";

describe("mapOfflineNative: checkNetworkConnectivity (Item 0.2)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("fixa a constante OFFLINE_CHECK_TIMEOUT_MS em exatamente 5000 ms", () => {
    expect(OFFLINE_CHECK_TIMEOUT_MS).toBe(5000);
  });

  it("retorna 'ok' para resposta HTTP 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await checkNetworkConnectivity("https://example.com/style");
    expect(outcome).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/style",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("retorna 'ok' para resposta HTTP 405 (Method Not Allowed)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 405, statusText: "Method Not Allowed" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await checkNetworkConnectivity("https://example.com/style");
    expect(outcome).toBe("ok");
  });

  it("retorna 'ok' para resposta HTTP 500 (Internal Server Error)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await checkNetworkConnectivity("https://example.com/style");
    expect(outcome).toBe("ok");
  });

  it("retorna 'failed' quando fetch rejeita com TypeError (exceção de rede)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Network request failed"));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await checkNetworkConnectivity("https://example.com/style");
    expect(outcome).toBe("failed");
  });

  it("retorna 'timeout' e aborta o AbortController quando a resposta estoura OFFLINE_CHECK_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    let signalAborted = false;

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          signalAborted = true;
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = checkNetworkConnectivity("https://example.com/style", OFFLINE_CHECK_TIMEOUT_MS);
    vi.advanceTimersByTime(OFFLINE_CHECK_TIMEOUT_MS);

    const outcome = await promise;
    expect(outcome).toBe("timeout");
    expect(signalAborted).toBe(true);
  });

  it("chama fetch com método HEAD e passa o signal do AbortController", async () => {
    let passedSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      passedSignal = init?.signal;
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkNetworkConnectivity("https://example.com/style");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/style",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(passedSignal).toBeInstanceOf(AbortSignal);
  });

  it("executa clearTimeout sem deixar timers pendentes em sucesso e em falha", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    // Caso de sucesso
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await checkNetworkConnectivity("https://example.com/style");
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    // Caso de falha por exceção
    clearTimeoutSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await checkNetworkConnectivity("https://example.com/style");
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("o valor padrão de checkConnectivity em startOfflineMapDownload é checkNetworkConnectivity (guarda ancorada)", () => {
    const filePath = join(__dirname, "mapOfflineNative.ts");
    const content = readFileSync(filePath, "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[\s;{(,])\/\/.*$/gm, "$1")
      .replace(/\s+/g, " ");

    expect(content).toMatch(
      /checkConnectivity:\s*\(\)\s*=>\s*Promise<NetworkCheckOutcome>\s*=\s*checkNetworkConnectivity/,
    );
  });
});
