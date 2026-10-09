/** SÓ PARA TESTE: um `PositionPort` controlável. Nenhum arquivo do app importa este. */
import type { PositionFix } from "@notebus/domain";
import type { PermissionState, PositionPort } from "./devicePosition";

export interface FakePositionPort extends PositionPort {
  reads: number;
  requests: number;
  permissionState: PermissionState;
  /** O que `read()` devolve; `"never"` = nunca responde; `"throw"` = rejeita. */
  next: PositionFix | null | "never" | "throw";
  /** O que `request()` devolve e grava como permissão. */
  requestResult: "granted" | "denied";
}

export function createFakePositionPort(init: Partial<Pick<FakePositionPort, "permissionState" | "next" | "requestResult">> = {}): FakePositionPort {
  const port: FakePositionPort = {
    reads: 0,
    requests: 0,
    permissionState: init.permissionState ?? "granted",
    next: init.next ?? null,
    requestResult: init.requestResult ?? "granted",
    async permission() {
      return port.permissionState;
    },
    async request() {
      port.requests++;
      port.permissionState = port.requestResult;
      return port.requestResult;
    },
    read() {
      port.reads++;
      if (port.next === "never") return new Promise<never>(() => {});
      if (port.next === "throw") return Promise.reject(new Error("falha"));
      return Promise.resolve(port.next);
    },
  };
  return port;
}
