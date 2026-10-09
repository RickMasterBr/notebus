/**
 * Última posição conhecida em memória e o aquecimento (E-07 §3.3, D-108). Puro: sem React, sem relógio.
 *
 * - `getFix()` devolve o valor **na hora**, sem esperar nada.
 * - `warm()` pede **uma** posição ao port, se a permissão já é `granted`; sem permissão não pede nada; enquanto um pedido
 *   está em andamento, outro `warm()` não duplica. Um port que nunca responde é largado depois de `READ_TIMEOUT_MS`.
 * - `askOnce()` pede a permissão **uma vez** por sessão, só quando ela ainda é `undetermined`; nunca espera quem chama.
 * Nada aqui lança.
 */
import type { PositionFix } from "@notebus/domain";
import type { PermissionState, PositionPort } from "./devicePosition";

export const READ_TIMEOUT_MS = 20_000;

export interface PositionStore {
  getFix(): PositionFix | null;
  getPermission(): PermissionState;
  subscribe(listener: () => void): () => void;
  warm(): Promise<void>;
  askOnce(): void;
}

export function createPositionStore(port: PositionPort): PositionStore {
  let fix: PositionFix | null = null;
  let permission: PermissionState = "undetermined";
  let inFlight = false;
  let asked = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  async function warm(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const prev = permission;
      permission = await port.permission();
      if (permission !== prev) emit();
      if (permission !== "granted") return;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
      });
      const next = await Promise.race([port.read(), timeout]);
      if (next) {
        fix = next;
        emit();
      }
    } catch {
      // erro vira "sem posição nova": a anterior continua valendo
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      inFlight = false;
    }
  }

  function askOnce(): void {
    if (asked) return;
    asked = true; // negar não pede de novo na mesma sessão
    void (async () => {
      try {
        const prev = permission;
        permission = await port.permission();
        if (permission !== "undetermined") {
          if (permission !== prev) emit();
          return;
        }
        permission = await port.request();
        emit();
        if (permission === "granted") await warm();
      } catch {
        /* sem permissão: o Registrar segue pela rotina */
      }
    })();
  }

  return {
    getFix: () => fix,
    getPermission: () => permission,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    warm,
    askOnce,
  };
}
