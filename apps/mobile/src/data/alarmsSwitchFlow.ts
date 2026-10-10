/**
 * Lógica pura do fluxo do interruptor "Permitir avisos de saída" (TL-12, E-08 Bloco 1b, Item 6).
 *
 * Dado o estado da permissão de notificações do sistema e a intenção de ligar/desligar,
 * devolve a ação: "disable", "ask_reason", "enable" ou "denied".
 * Ordem obrigatória (D-031): motivo, depois sistema.
 */
import type { PermissionState } from "../notifications/port";

export type AlarmsSwitchAction = "disable" | "ask_reason" | "enable" | "denied";

export function alarmsSwitchDecision(
  permission: PermissionState,
  target: boolean,
): AlarmsSwitchAction {
  if (!target) {
    return "disable";
  }
  switch (permission) {
    case "undetermined":
      return "ask_reason";
    case "granted":
      return "enable";
    case "denied":
      return "denied";
  }
}
