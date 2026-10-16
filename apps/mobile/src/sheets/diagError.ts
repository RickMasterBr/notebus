/**
 * Formatação pura do erro mostrado na tela de erro e na faixa de diagnóstico (E-09 bloco 18).
 * Só usada com `DIAG_SCROLL`. TypeScript puro, testado no Node.
 */

export const DIAG_ERROR_MESSAGE_MAX = 400;
export const DIAG_ERROR_STACK_LINES = 12;
export const DIAG_ERROR_LINE_MAX = 120;
export const DIAG_ERROR_COMPONENT_LINES = 6;

export type DiagErrorInfo = {
  message: string;
  stackLines: string[];
  componentLines: string[];
};

const cut = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

const toLines = (text: unknown, maxLines: number): string[] => {
  if (typeof text !== "string" || text.trim() === "") return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, maxLines)
    .map((line) => cut(line, DIAG_ERROR_LINE_MAX));
};

/** Aceita qualquer coisa que tenha sido lançada (`throw "texto"`, objeto, `undefined`). */
export function formatDiagError(error: unknown, componentStack?: string | null): DiagErrorInfo {
  const raw = error as { message?: unknown; stack?: unknown } | null | undefined;
  const rawMessage = typeof raw?.message === "string" ? raw.message : typeof error === "string" ? error : String(error);
  return {
    message: cut(rawMessage, DIAG_ERROR_MESSAGE_MAX),
    stackLines: toLines(raw?.stack, DIAG_ERROR_STACK_LINES),
    componentLines: toLines(componentStack, DIAG_ERROR_COMPONENT_LINES),
  };
}
