/**
 * Aviso "o ônibus das HH:MM não existe mais desde DD/MM" (ideia 242).
 *
 * Lê os eventos `alarm_event` que o agendador já gravou: os dias em que a
 * viagem do aviso não existe no horário novo ficam `skipped` com motivo
 * `no_trip`. Aqui só se escolhe o primeiro dia dessa série, depois do último
 * dia bom do aviso, para a lista de avisos mostrar o problema antes do
 * ônibus ser perdido. Domínio, agendador e histórico não mudam.
 */
import type { AlarmEventRow, AlarmRow } from "../db/alarms";
import { t } from "../i18n";
import { minuteText, shortDateText } from "./alarmsUi";

/**
 * Uma mensagem por aviso afetado, com chave `alarm.id`.
 *
 * Afetado = tem evento `skipped` com `no_trip` de `today` em diante.
 * `desde` = menor `serviceDate` dos `no_trip` depois do último dia bom
 * (evento não pulado com `serviceDate <= today`), ou a menor de todas
 * quando não há dia bom.
 */
export function noTripNotices(
  alarms: readonly AlarmRow[],
  events: readonly AlarmEventRow[],
  today: string,
): Map<string, string> {
  const notices = new Map<string, string>();

  for (const alarm of alarms) {
    const own = events.filter((e) => e.alarmId === alarm.id);

    const affected = own.some(
      (e) => e.state === "skipped" && e.skipReason === "no_trip" && e.serviceDate >= today,
    );
    if (!affected) continue;

    let lastGood: string | null = null;
    for (const e of own) {
      if (e.state === "skipped" || e.serviceDate > today) continue;
      if (lastGood === null || e.serviceDate > lastGood) lastGood = e.serviceDate;
    }

    let since: string | null = null;
    for (const e of own) {
      if (e.state !== "skipped" || e.skipReason !== "no_trip") continue;
      if (lastGood !== null && e.serviceDate <= lastGood) continue;
      if (since === null || e.serviceDate < since) since = e.serviceDate;
    }
    if (since === null) continue;

    notices.set(
      alarm.id,
      t("alarms.no_trip", {
        time: minuteText(alarm.anchorBaseMinute),
        date: shortDateText(since),
      }),
    );
  }

  return notices;
}
