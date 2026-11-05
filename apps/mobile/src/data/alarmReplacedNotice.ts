/**
 * Aviso de substituição que já passou (ideia 230).
 *
 * A regra D-105 não muda: o aviso antigo continua desativado e o desfazer funciona.
 * Só a mensagem "Substituiu o aviso das HH:MM" some quando o aviso de data única
 * substituído já passou — o das 16:40 de uma viagem anterior, com o novo às 18:12.
 */
import { lisbonInstants, type AlarmReplacement } from "@notebus/domain";

/**
 * Diz se a mensagem de substituição deve aparecer.
 *
 * Só o aviso de data única pode ter "passado": os dias perdidos por um aviso que
 * repete são futuros. Sem o horário do aviso antigo, não há como saber — mostra.
 */
export function shouldAnnounceReplaced(
  rep: AlarmReplacement,
  oldAnchorBaseMinute: number | null,
  nowMs: number,
): boolean {
  if (rep.onceDate === undefined || oldAnchorBaseMinute === null) return true;
  const instants = lisbonInstants(rep.onceDate, oldAnchorBaseMinute);
  if (instants.length === 0) return true;
  return Math.max(...instants) > nowMs;
}
