/** Registro das telas abertas: a rota leva só `{ id }`; a entrada (que pode levar função) fica aqui, em memória. */
import { createNavigationContainerRef } from "@react-navigation/native";
import type { SheetContent, SheetEntry } from "../sheets/stack";

export type RootParamList = { inicio: undefined; tela: { id: number } };

export const navigationRef = createNavigationContainerRef<RootParamList>();

const entries = new Map<number, SheetEntry>();
// Começa longe dos ids da pilha de folhas (que partem de 1) para nunca colidirem.
let nextScreenId = 1_000_000;

export function registerScreenEntry(sheet: SheetContent): SheetEntry {
  const entry: SheetEntry = { ...sheet, id: nextScreenId++ };
  entries.set(entry.id, entry);
  return entry;
}

export const getScreenEntry = (id: number): SheetEntry | undefined => entries.get(id);

/** Ids das rotas `tela` num estado de navegação, na ordem (a do topo é a última). */
export function screenIdsOf(state: { routes: readonly { name: string; params?: object }[] } | undefined): number[] {
  const ids: number[] = [];
  for (const route of state?.routes ?? []) {
    const id = (route.params as { id?: unknown } | undefined)?.id;
    if (route.name === "tela" && typeof id === "number") ids.push(id);
  }
  return ids;
}

/** As entradas das telas abertas, na ordem. */
export function openScreenEntries(state: Parameters<typeof screenIdsOf>[0]): SheetEntry[] {
  return screenIdsOf(state).flatMap((id) => {
    const entry = entries.get(id);
    return entry ? [entry] : [];
  });
}
