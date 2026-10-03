/** Desenha a pilha: a folha-base e, por cima, cada folha empilhada (a última recebe o toque). */
import type { ReactElement } from "react";
import { HomeSheet } from "./HomeSheet";
import { SearchSheet } from "./SearchSheet";
import { useSheets } from "./SheetsContext";
import { type SheetKind, stackedSheets } from "./stack";

/** A folha-base ("home") não entra aqui: ela é sempre a `HomeSheet`. */
const stacked: Record<Exclude<SheetKind, "home">, () => ReactElement> = {
  search: () => <SearchSheet />,
};

export function SheetHost() {
  const { state } = useSheets();
  return (
    <>
      <HomeSheet />
      {stackedSheets(state).map((entry) => (
        <StackedSheetSlot key={entry.id} kind={entry.kind} />
      ))}
    </>
  );
}

function StackedSheetSlot({ kind }: { kind: SheetKind }) {
  return kind === "home" ? null : stacked[kind]();
}
