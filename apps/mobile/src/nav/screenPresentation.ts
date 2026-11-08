/**
 * Como a folha aparece empilhada (D-392): em cartão, por cima da Home, ou em modal, cobrindo a tela.
 * TypeScript puro: a decisão fica aqui, não no `SheetHost`, para ser testada no Node.
 */
import type { SheetKind } from "../sheets/stack";

export type SheetPresentation = "modal" | "card";

/** O `trip` é a Tela de viagem e o `alarmIntro` pede uma decisão; os restantes são cartões. */
export function presentationOf(kind: SheetKind): SheetPresentation {
  return kind === "trip" || kind === "alarmIntro" ? "modal" : "card";
}
