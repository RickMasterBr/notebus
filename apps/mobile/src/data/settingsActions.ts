/**
 * Ações e decisões das telas de Ajustes e Avisos extraídas como funções puras.
 * Permite testes diretos com portas/mocks sem depender de renderização ou regex frágil.
 */
import { type DeleteResult } from "../db/calendarEdits";
import { t } from "../i18n";
import { type TestAlarmResult } from "../notifications/scheduler";
import { type AlarmsSwitchAction, alarmsSwitchDecision } from "./alarmsSwitchFlow";
import { stepMargin } from "./settingsView";

export interface ChangeMarginParams {
  current: number;
  direction: 1 | -1;
  setMargin: (next: number) => Promise<boolean>;
}

/**
 * 1. changeMargin: calcula o novo valor com stepMargin, chama setMargin(novo) e,
 * se devolver false, devolve o valor anterior; devolve o valor que a tela deve mostrar.
 */
export async function changeMargin({ current, direction, setMargin }: ChangeMarginParams): Promise<number> {
  const step = stepMargin(current, direction);
  if (step.value === current) {
    return current;
  }
  const ok = await setMargin(step.value);
  return ok ? step.value : current;
}

export interface ToggleAlarmsParams {
  next: boolean;
  decide: (next: boolean) => Promise<AlarmsSwitchAction> | AlarmsSwitchAction;
  setAlarmsAllowed: (allowed: boolean) => Promise<{ ok: true } | { ok: false; reason: "no_permission" } | unknown>;
  openIntro: (options: {
    mode: "denied" | "reason";
    onResolve?: (accepted: boolean) => Promise<void> | void;
  }) => void;
}

/**
 * 2. toggleAlarms: usa a decisão de alarmsSwitchDecision e executa cada ramo:
 * - disable: chama setAlarmsAllowed(false)
 * - enable: chama setAlarmsAllowed(true)
 * - denied: abre alarmIntro em modo denied
 * - ask_reason: abre frase de motivo (modo reason) e, se aceito, chama setAlarmsAllowed(true)
 */
export async function toggleAlarms({ next, decide, setAlarmsAllowed, openIntro }: ToggleAlarmsParams): Promise<void> {
  const action = await decide(next);
  switch (action) {
    case "disable":
      await setAlarmsAllowed(false);
      break;

    case "enable":
      await setAlarmsAllowed(true);
      break;

    case "denied":
      openIntro({ mode: "denied" });
      break;

    case "ask_reason":
      openIntro({
        mode: "reason",
        onResolve: async (accepted: boolean) => {
          if (!accepted) return;
          const res = await setAlarmsAllowed(true);
          if (res && typeof res === "object" && "ok" in res && !res.ok && (res as { reason?: string }).reason === "no_permission") {
            openIntro({ mode: "denied" });
          }
        },
      });
      break;
  }
}

export interface ActionToastPort {
  show: (options: {
    title: string;
    kind?: "error";
    action?: {
      label: string;
      run: () => Promise<void> | void;
    };
  }) => void;
}

/**
 * 3. deleteOverrideWithUndo: apaga com o id recebido e mostra toast com Desfazer.
 */
export async function deleteOverrideWithUndo({
  id,
  deleteOverride,
  now,
  toast,
  onSuccess,
}: {
  id: string;
  deleteOverride: (id: string, nowMs: number) => Promise<DeleteResult>;
  now: () => number;
  toast: ActionToastPort;
  onSuccess?: () => void;
}): Promise<void> {
  const res = await deleteOverride(id, now());
  if (!res.ok) {
    return;
  }
  onSuccess?.();
  toast.show({
    title: t("override.deleted"),
    action: {
      label: t("toast.action.undo"),
      run: async () => {
        await res.undo(now());
        onSuccess?.();
      },
    },
  });
}

/**
 * deleteHolidayWithUndo: apaga feriado com o id recebido e mostra toast com Desfazer.
 */
export async function deleteHolidayWithUndo({
  id,
  deleteHoliday,
  now,
  toast,
  onSuccess,
}: {
  id: string;
  deleteHoliday: (id: string, nowMs: number) => Promise<DeleteResult>;
  now: () => number;
  toast: ActionToastPort;
  onSuccess?: () => void;
}): Promise<void> {
  const res = await deleteHoliday(id, now());
  if (!res.ok) {
    if (res.reason === "official") {
      toast.show({
        title: t("holiday.error.official"),
        kind: "error",
      });
    }
    return;
  }
  onSuccess?.();
  toast.show({
    title: t("holiday.deleted"),
    action: {
      label: t("toast.action.undo"),
      run: async () => {
        await res.undo(now());
        onSuccess?.();
      },
    },
  });
}

/**
 * 5. testAlarmToastKey: mapeia cada resultado do aviso de teste (inclusive alarms_off)
 * para a chave do toast correspondente, com switch exaustivo.
 */
export function testAlarmToastKey(
  result: TestAlarmResult,
): "alarms.test_scheduled" | "alarms.test_no_option" | "settings.alarms.test_off" | null {
  if (result.ok) {
    return "alarms.test_scheduled";
  }
  switch (result.reason) {
    case "alarms_off":
      return "settings.alarms.test_off";
    case "no_option":
      return "alarms.test_no_option";
    case "permission_denied":
      return null;
  }
}
