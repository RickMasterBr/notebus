/**
 * Pilha de folhas (4.1 §2, D-027): uma tela-base e folhas empilhadas por cima, sem router.
 * TypeScript puro (sem React nem biblioteca nativa) para ser testado no Node.
 *
 * Exemplo: o app abre só com a folha "home". Tocar na busca empilha "search" (a pilha vira [home, search]);
 * fechar a do topo volta a [home]. A folha-base nunca sai da pilha.
 */

/**
 * Folhas que existem hoje. "stop" é a folha **provisória** de ponto (E-02 bloco 3b): o bloco 4 a troca pela TL-02.
 * Cada folha leva o que precisa para se desenhar.
 */
export type SheetContent =
  | { kind: "home" }
  | { kind: "search" }
  | { kind: "stop"; stopId: string; name: string };

export type SheetKind = SheetContent["kind"];

export type SheetEntry = SheetContent & {
  /** Identifica a folha enquanto ela existe (chave do React); nunca se repete. */
  id: number;
};

/** Os 3 detents da folha inicial (4.4 §5.1): pequeno, médio, grande. */
export type Detent = 0 | 1 | 2;

export interface SheetStackState {
  /** A primeira é sempre a folha-base ("home"). A última é a ativa. */
  stack: readonly SheetEntry[];
  /** Detent atual da folha inicial. */
  detent: Detent;
  nextId: number;
}

export type SheetAction =
  | { type: "push"; sheet: SheetContent }
  | { type: "pop" }
  | { type: "replace"; sheet: SheetContent }
  | { type: "setDetent"; detent: Detent };

export const initialSheetState: SheetStackState = {
  stack: [{ id: 0, kind: "home" }],
  detent: 0,
  nextId: 1,
};

export function sheetReducer(state: SheetStackState, action: SheetAction): SheetStackState {
  switch (action.type) {
    case "push": {
      // Empilhar a mesma folha que já está no topo não faz nada (duplo toque na pílula ou no resultado).
      if (sameSheet(activeSheet(state), action.sheet)) return state;
      return { ...state, stack: [...state.stack, { ...action.sheet, id: state.nextId }], nextId: state.nextId + 1 };
    }
    case "pop": {
      // A folha-base não fecha.
      if (state.stack.length <= 1) return state;
      return { ...state, stack: state.stack.slice(0, -1) };
    }
    case "replace": {
      // Troca a do topo por outra; na base não há o que trocar (use "push").
      if (state.stack.length <= 1) return state;
      const next: SheetEntry = { ...action.sheet, id: state.nextId };
      return { ...state, stack: [...state.stack.slice(0, -1), next], nextId: state.nextId + 1 };
    }
    case "setDetent":
      return state.detent === action.detent ? state : { ...state, detent: action.detent };
  }
}

function sameSheet(a: SheetContent, b: SheetContent): boolean {
  return a.kind === b.kind && (a.kind !== "stop" || b.kind !== "stop" || a.stopId === b.stopId);
}

/** A folha que recebe o toque agora: a do topo. */
export function activeSheet(state: SheetStackState): SheetEntry {
  return state.stack[state.stack.length - 1] ?? initialSheetState.stack[0]!;
}

/** Só as folhas empilhadas por cima da base. */
export function stackedSheets(state: SheetStackState): readonly SheetEntry[] {
  return state.stack.slice(1);
}

export function detentFromIndex(index: number): Detent {
  return index <= 0 ? 0 : index === 1 ? 1 : 2;
}
