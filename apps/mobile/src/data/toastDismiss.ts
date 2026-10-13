/**
 * Regra do botão Fechar no toast (E-08.5 bloco 4, Item 2):
 * Devolve true apenas quando o toast não some sozinho (kind === "error").
 * Toasts com kind "info" ou "refusal" (ou kind ausente) somem sozinhos pelo temporizador.
 */
export function toastShowsClose(toast: { kind?: "info" | "error" | "refusal" }): boolean {
  return toast.kind === "error";
}
