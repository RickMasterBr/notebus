/**
 * Bloqueio total de rede em tempo de execução para testes E2E/Maestro (E-09 §3.4, T-92 a T-94).
 * Quando `EXPO_PUBLIC_NB_NO_NETWORK=1` está ativa, qualquer chamada a fetch, XMLHttpRequest ou WebSocket
 * lança erro imediatamente, garantindo que o app funcione estritamente local-first e offline.
 */

export class NetworkBlockedError extends Error {
  constructor(target?: string) {
    super(`[NB_NO_NETWORK] Requisição de rede bloqueada${target ? `: ${target}` : ""}`);
    this.name = "NetworkBlockedError";
  }
}

export function isNoNetworkEnabled(): boolean {
  return process.env.EXPO_PUBLIC_NB_NO_NETWORK === "1";
}

let installed = false;
let originalFetch: typeof globalThis.fetch | null = null;
let OriginalXMLHttpRequest: typeof globalThis.XMLHttpRequest | null = null;
let OriginalWebSocket: typeof globalThis.WebSocket | null = null;

/**
 * Instala interceptores globais se EXPO_PUBLIC_NB_NO_NETWORK=1 (ou se force === true).
 * Devolve uma função de restauração para facilitar testes unitários.
 */
export function installNoNetwork(force = false): () => void {
  if (!force && !isNoNetworkEnabled()) {
    return () => {};
  }

  if (!installed) {
    originalFetch = globalThis.fetch;
    OriginalXMLHttpRequest = globalThis.XMLHttpRequest;
    OriginalWebSocket = globalThis.WebSocket;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      throw new NetworkBlockedError(url);
    };

    if (OriginalXMLHttpRequest) {
      class BlockedXMLHttpRequest extends OriginalXMLHttpRequest {
        open(..._args: any[]) {
          throw new NetworkBlockedError("XMLHttpRequest.open");
        }
        send(..._args: any[]) {
          throw new NetworkBlockedError("XMLHttpRequest.send");
        }
      }
      globalThis.XMLHttpRequest = BlockedXMLHttpRequest as any;
    }

    if (OriginalWebSocket) {
      class BlockedWebSocket extends OriginalWebSocket {
        constructor(..._args: any[]) {
          super("ws://127.0.0.1:0");
          throw new NetworkBlockedError("WebSocket");
        }
      }
      globalThis.WebSocket = BlockedWebSocket as any;
    }

    installed = true;
  }

  return restoreNetwork;
}

/**
 * Restaura as APIs de rede originais.
 */
export function restoreNetwork(): void {
  if (installed) {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
    }
    if (OriginalXMLHttpRequest) {
      globalThis.XMLHttpRequest = OriginalXMLHttpRequest;
      OriginalXMLHttpRequest = null;
    }
    if (OriginalWebSocket) {
      globalThis.WebSocket = OriginalWebSocket;
      OriginalWebSocket = null;
    }
    installed = false;
  }
}
