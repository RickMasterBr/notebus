/**
 * Pilha de folhas (4.1 §2, D-027): uma tela-base e folhas empilhadas por cima, sem router.
 * TypeScript puro (sem React nem biblioteca nativa) para ser testado no Node.
 *
 * Exemplo: o app abre só com a folha "home". Tocar na busca empilha "search" (a pilha vira [home, search]);
 * fechar a do topo volta a [home]. A folha-base nunca sai da pilha.
 */

/** Folhas que existem hoje. O bloco 3b troca "search" pela TL-14 e acrescenta as outras. */
export type SheetKind = "home" | "search";

export interface SheetEntry {
  /** Identifica a folha enquanto ela existe (chave do React); nunca se repete. */
  id: number;
  kind: SheetKind;
}

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
  | { type: "push"; kind: SheetKind }
  | { type: "pop" }
  | { type: "replace"; kind: SheetKind }
  | { type: "setDetent"; detent: Detent };

export const initialSheetState: SheetStackState = {
  stack: [{ id: 0, kind: "home" }],
  detent: 0,
  nextId: 1,
};

export function sheetReducer(state: SheetStackState, action: SheetAction): SheetStackState {
  switch (action.type) {
    case "push": {
      // Empilhar a mesma folha que já está no topo não faz nada (duplo toque na pílula).
      if (activeSheet(state).kind === action.kind) return state;
      return { ...state, stack: [...state.stack, { id: state.nextId, kind: action.kind }], nextId: state.nextId + 1 };
    }
    case "pop": {
      // A folha-base não fecha.
      if (state.stack.length <= 1) return state;
      return { ...state, stack: state.stack.slice(0, -1) };
    }
    case "replace": {
      // Troca a do topo por outra; na base não há o que trocar (use "push").
      if (state.stack.length <= 1) return state;
      const next: SheetEntry = { id: state.nextId, kind: action.kind };
      return { ...state, stack: [...state.stack.slice(0, -1), next], nextId: state.nextId + 1 };
    }
    case "setDetent":
      return state.detent === action.detent ? state : { ...state, detent: action.detent };
  }
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
