/**
 * Preferências em ação (E-08 §3.1, §3.3, D-019, D-114): cada setter valida, grava na fila de gravações do registro, pede a
 * recarga dos horários (a margem e os municipais moram no `ScheduleSnapshot`) e aciona a regra única de reagendamento
 * dos avisos (E-06 §3.2), porque as duas coisas mudam as horas em que um aviso toca.
 *
 * Sem React e sem relógio aqui: o instante vem de quem chama (`nowMs`). O `PreferencesProvider` só liga isto à árvore.
 */
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { ensureAlarmPermission } from "../notifications/permission";
import type { NotificationsPort } from "../notifications/port";
import { ALARMS_ALLOWED_KEY, INCLUDE_MUNICIPAL_KEY, MARGIN_KEY, type Preferences, isValidMargin, readPreferences, writePreference } from "../db/preferences";

type AnyDb = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface PreferencesDeps {
  db: AnyDb;
  /** A fila de gravações do registro (`registro.exclusive`): uma transação por vez no mesmo banco. */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
  /** Recarrega os horários (`useScheduleReload`); a margem e o interruptor dos municipais vêm junto. */
  reload: () => Promise<unknown>;
  /** A regra única de reagendamento dos avisos (`scheduler.reschedule`, com o relógio real). */
  reschedule: () => Promise<unknown>;
  /** A porta das notificações: ligar os avisos pede a permissão do sistema por ela. */
  port: NotificationsPort;
  /**
   * Antes do pedido do sistema, a tela do bloco 1b mostra a frase de motivo e devolve `true` para seguir (E-06 §5).
   * Padrão: segue direto para o pedido do sistema.
   */
  askPermission?: () => Promise<boolean>;
  newId?: (at: number) => string;
}

export function createPreferences(deps: PreferencesDeps) {
  const { db, exclusive } = deps;

  const write = (key: string, value: number | boolean, nowMs: number) =>
    exclusive(() => writePreference(db, key, value, nowMs, deps.newId));

  const afterChange = async () => {
    await deps.reload();
    await deps.reschedule();
  };

  /** Margem do "esteja no ponto às": só inteiro de 0 a 10; outro valor devolve `false` e não grava. */
  async function setMargin(value: number, nowMs: number): Promise<boolean> {
    if (!isValidMargin(value)) return false;
    await write(MARGIN_KEY, value, nowMs);
    await afterChange();
    return true;
  }

  async function setIncludeMunicipalHolidays(value: boolean, nowMs: number): Promise<void> {
    await write(INCLUDE_MUNICIPAL_KEY, value, nowMs);
    await afterChange();
  }

  /**
   * "Permitir avisos de saída" (E-08 §3.4, D-031): desligado, o agendador cancela tudo e não agenda nada, e os avisos ficam
   * guardados; ligado, reagenda tudo. Ligar sem a permissão do sistema não liga: `no_permission`, nada gravado.
   */
  async function setAlarmsAllowed(value: boolean, nowMs: number): Promise<{ ok: true } | { ok: false; reason: "no_permission" }> {
    if (value) {
      const permission = await ensureAlarmPermission(deps.port, { ask: deps.askPermission ?? (async () => true) });
      if (permission !== "granted") return { ok: false, reason: "no_permission" };
    }
    await write(ALARMS_ALLOWED_KEY, value, nowMs);
    await afterChange();
    return { ok: true };
  }

  const read = (): Promise<Preferences> => readPreferences(db);

  return { read, setMargin, setIncludeMunicipalHolidays, setAlarmsAllowed };
}

export type PreferencesStore = ReturnType<typeof createPreferences>;
