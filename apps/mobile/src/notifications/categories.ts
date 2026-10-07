/** As categorias de notificação e os botões (E-06 §4.1, §5.2; D-102). Os rótulos vêm do catálogo. */
import { t } from "../i18n";
import type { CategorySpec } from "./port";

export const DEPARTURE_CATEGORY = "departure";
export const BOARD_CONFIRM_CATEGORY = "boardConfirm";

export const ACTION_BOARD = "board";
export const ACTION_SNOOZE = "snooze";
export const ACTION_DISMISS = "dismiss";
export const ACTION_UNDO = "undo";
export const ACTION_ADJUST = "adjust";

export function notificationCategories(): CategorySpec[] {
  return [
    {
      id: DEPARTURE_CATEGORY,
      actions: [
        { id: ACTION_BOARD, title: t("notif.action.board"), opensApp: false },
        { id: ACTION_SNOOZE, title: t("notif.action.snooze"), opensApp: false },
        { id: ACTION_DISMISS, title: t("notif.action.dismiss"), opensApp: false },
      ],
    },
    {
      id: BOARD_CONFIRM_CATEGORY,
      actions: [
        { id: ACTION_UNDO, title: t("toast.action.undo"), opensApp: false },
        { id: ACTION_ADJUST, title: t("toast.action.adjust"), opensApp: true },
      ],
    },
  ];
}
