/**
 * Permissão do aviso (E-06 §5, T-60, D-031). Sem permissão, nada é agendado e o app não insiste: se já foi negada,
 * não pede de novo.
 */
import type { NotificationsPort, PermissionState } from "./port";

export interface EnsurePermissionOptions {
  /**
   * A tela (bloco 3) mostra a frase de motivo e devolve `true` se o usuário quer seguir para o pedido do sistema.
   * Sem `ask`, o pedido do sistema não é feito.
   */
  ask?: () => Promise<boolean>;
}

export async function ensureAlarmPermission(port: NotificationsPort, options: EnsurePermissionOptions = {}): Promise<PermissionState> {
  const current = await port.getPermission();
  if (current !== "undetermined") return current;
  if (!options.ask || !(await options.ask())) return "undetermined";
  return port.requestPermission();
}
