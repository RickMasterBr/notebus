import { type MessageKey, ptBR } from "./pt-BR";

export type { MessageKey };

/** `t("first_run.importing", { count: 9 })` → "Importando 9 linhas…". Só pt-BR no MVP; sem biblioteca. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return ptBR[key].replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? `{{${name}}}`));
}
