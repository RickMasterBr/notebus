/**
 * Pilha de folhas (4.1 §2, D-027): uma tela-base e folhas empilhadas por cima, sem router.
 * TypeScript puro (sem React nem biblioteca nativa) para ser testado no Node.
 *
 * Exemplo: o app abre só com a folha "home". Tocar na busca empilha "search" (a pilha vira [home, search]);
 * fechar a do topo (por id) volta a [home]. A folha-base nunca sai da pilha.
 */

/**
 * Folhas que existem hoje. "stop" é a TL-02 Ponto (E-02 bloco 4); "ahead" é a TL-05 Daqui para a frente (bloco 5a):
 * uma passagem de uma viagem. Cada folha leva o que precisa para se desenhar.
 */
export type SheetContent =
  | { kind: "home" }
  /** `pick`: a Busca reaproveitada para escolher o ponto da folha Registrar; o toque devolve o ponto em vez de abri-lo. */
  | { kind: "search"; pick?: boolean }
  | { kind: "stop"; stopId: string; name: string }
  | { kind: "ahead"; tripId: string; position: number }
  /** TL-03 Registrar (E-03). `stopId` vem do "Registrar aqui" do Ponto; `null` = o ponto sugerido (4.1 §6.1). */
  | { kind: "board"; stopId: string | null }
  /** "Onde você desceu?" (E-03), a lista do "Desci aqui" do cartão Em viagem. */
  | { kind: "alight" }
  /** As paragens que faltam até o fim do percurso (D-075), aberta ao puxar o cartão Em viagem. Só leitura. */
  | { kind: "trip" }
  /** Ajustes mínimo (D-151): só a versão e as 7 batidas que abrem o seletor do relógio de teste. */
  | { kind: "settings" }
  | { kind: "clockPicker" }
  /** Prévia da importação do backup (E-03 §5.4), aberta pelo "Importar backup" de Ajustes. O arquivo fica no `BackupProvider`. */
  | { kind: "backupImport" };

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
  | { type: "close"; id: number }
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
      // Regra: a mesma folha nunca aparece duas vezes na pilha. Já no topo: nada a fazer (duplo toque na pílula ou no resultado).
      // Já na pilha, mas por baixo: sobe para o topo, com id novo (a folha é montada de novo e a tela volta a bater com a pilha).
      if (sameSheet(activeSheet(state), action.sheet)) return state;
      const kept = state.stack.filter((e, i) => i === 0 || !sameSheet(e, action.sheet));
      return { ...state, stack: [...kept, { ...action.sheet, id: state.nextId }], nextId: state.nextId + 1 };
    }
    case "close": {
      // Fecha pelo id, não pela posição: um aviso atrasado ou repetido da biblioteca não derruba outra folha.
      // Só a do topo fecha; a folha-base nunca; id que já saiu (fechamento em dobro) não faz nada.
      const top = activeSheet(state);
      if (state.stack.length <= 1 || top.id !== action.id) return state;
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
  if (a.kind !== b.kind) return false;
  if (a.kind === "stop" && b.kind === "stop") return a.stopId === b.stopId;
  if (a.kind === "ahead" && b.kind === "ahead") return a.tripId === b.tripId && a.position === b.position;
  return true;
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
