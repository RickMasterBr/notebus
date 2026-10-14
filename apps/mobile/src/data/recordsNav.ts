/**
 * Decisões puras para navegação na folha Registros (E-08.5 Bloco 16, D-206, D-207).
 * Puro: sem React, sem banco, sem relógio.
 */

export type RecordsPage =
  | { kind: "list" }
  | { kind: "trip"; boardingId: string };

export type RecordsNavAction =
  | { type: "open"; boardingId: string }
  | { type: "back" };

export function recordsNavReduce(page: RecordsPage, action: RecordsNavAction): RecordsPage {
  if (action.type === "open") {
    return { kind: "trip", boardingId: action.boardingId };
  }
  return { kind: "list" };
}

export interface RecordsHandleInfo {
  showClose: false;
  press: "close" | "back";
}

export function recordsHandle(page: RecordsPage): RecordsHandleInfo {
  return {
    showClose: false,
    press: page.kind === "list" ? "close" : "back",
  };
}

export function showHeaderClose(page: RecordsPage): boolean {
  return page.kind === "list";
}
