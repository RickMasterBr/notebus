/**
 * A porta real (E-06 §4): fina, no padrão do spike S-01. **Único arquivo que importa `expo-notifications`** e o único
 * que lê `.date` de uma notificação (via `nativeDateToMs`). Sem teste: só o iPhone prova o resultado.
 */
import * as Notifications from "expo-notifications";
import { nativeDateToMs } from "./dates";
import type {
  CategorySpec,
  NotificationData,
  NotificationRequest,
  NotificationResponse,
  NotificationsPort,
  PermissionState,
  PresentedNotification,
  ScheduledRequest,
} from "./port";

/** O instante agendado também vai no `data`: o ouvinte e a lista não leem o gatilho nativo. */
const AT_KEY = "__at";

function permissionOf(status: Notifications.NotificationPermissionsStatus): PermissionState {
  if (status.granted) return "granted";
  return status.status === Notifications.PermissionStatus.UNDETERMINED ? "undetermined" : "denied";
}

function contentOf(request: NotificationRequest): Notifications.NotificationContentInput {
  return {
    title: request.title,
    body: request.body,
    categoryIdentifier: request.categoryId,
    data: request.data,
    interruptionLevel: "active",
  };
}

function presentedOf(notification: Notifications.Notification): PresentedNotification {
  return {
    id: notification.request.identifier,
    deliveredAt: nativeDateToMs(notification.date),
    data: (notification.request.content.data ?? {}) as NotificationData,
  };
}

function responseOf(response: Notifications.NotificationResponse): NotificationResponse {
  return {
    actionId: response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? "default" : response.actionIdentifier,
    notification: presentedOf(response.notification),
  };
}

export const expoPort: NotificationsPort = {
  async getPermission() {
    return permissionOf(await Notifications.getPermissionsAsync());
  },
  async requestPermission() {
    return permissionOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  },
  async scheduleAt(request: ScheduledRequest) {
    await Notifications.scheduleNotificationAsync({
      identifier: request.id,
      content: { ...contentOf(request), data: { ...request.data, [AT_KEY]: request.at } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: request.at },
    });
  },
  cancelAllScheduled: () => Notifications.cancelAllScheduledNotificationsAsync(),
  cancelScheduled: (id) => Notifications.cancelScheduledNotificationAsync(id),
  async listScheduled() {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return pending.map((p) => {
      const { [AT_KEY]: at, ...data } = (p.content.data ?? {}) as NotificationData;
      return {
        id: p.identifier,
        at: typeof at === "number" ? at : 0,
        title: p.content.title ?? "",
        body: p.content.body ?? "",
        categoryId: p.content.categoryIdentifier ?? "",
        data,
      };
    });
  },
  async listPresented() {
    return (await Notifications.getPresentedNotificationsAsync()).map(presentedOf);
  },
  async present(request) {
    await Notifications.scheduleNotificationAsync({ identifier: request.id, content: contentOf(request), trigger: null });
  },
  dismissPresented: (id) => Notifications.dismissNotificationAsync(id),
  async setCategories(categories: CategorySpec[]) {
    for (const category of categories) {
      await Notifications.setNotificationCategoryAsync(
        category.id,
        category.actions.map((a) => ({ identifier: a.id, buttonTitle: a.title, options: { opensAppToForeground: a.opensApp } })),
      );
    }
  },
  showInForeground() {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  },
  async getLastResponse() {
    const last = await Notifications.getLastNotificationResponseAsync();
    return last ? responseOf(last) : null;
  },
  clearLastResponse: () => Notifications.clearLastNotificationResponseAsync(),
  onResponse(listener) {
    const subscription = Notifications.addNotificationResponseReceivedListener((r) => listener(responseOf(r)));
    return () => subscription.remove();
  },
};
