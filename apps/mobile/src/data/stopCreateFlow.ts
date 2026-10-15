/**
 * Fluxo de ações após salvar um Novo ponto criado via Busca (E-08.5 Bloco 14, D-193, T-137).
 * Lógica pura, sem React nem banco.
 */
import type { SheetAction, SheetEntry } from "../sheets/stack";

export interface AfterCreateInput {
  stack: readonly SheetEntry[];
  newStop: { id: string; name: string };
  mode: "pick" | "open";
}

/**
 * Devolve a lista de SheetAction a despachar depois que o Novo ponto foi salvo.
 * A partir da pilha no momento do salvamento (o Novo ponto no topo, a Busca logo abaixo).
 */
export function afterCreateActions({ stack, newStop, mode }: AfterCreateInput): SheetAction[] {
  if (stack.length === 0) return [];
  const top = stack[stack.length - 1];
  if (!top) return [];

  // Se a folha logo abaixo do topo não for "search", fecha só o Novo ponto (nunca fecha outra folha)
  const below = stack.length >= 2 ? stack[stack.length - 2] : undefined;
  if (!below || below.kind !== "search") {
    return [{ type: "close", id: top.id }];
  }

  // Com a Busca logo abaixo:
  // Ordem estrita: fecha o Novo ponto primeiro, depois fecha a Busca
  const closeTop: SheetAction = { type: "close", id: top.id };
  const closeSearch: SheetAction = { type: "close", id: below.id };

  if (mode === "pick") {
    return [closeTop, closeSearch];
  }

  // mode === "open"
  return [
    closeTop,
    closeSearch,
    {
      type: "push",
      sheet: { kind: "stop", stopId: newStop.id, name: newStop.name },
    },
  ];
}

/**
 * Decide se o aviso após salvar o ponto deve exibir a ação Desfazer (E-08.5 Fechamento, Item 4).
 * Com "pick" (Nova linha): o ponto entra na linha; Desfazer o ponto deixaria a paragem órfã,
 * portanto o aviso é exibido sem o botão Desfazer.
 */
export function showUndoAfterSave(afterSave: "pick" | "open" | undefined): boolean {
  return afterSave !== "pick";
}
