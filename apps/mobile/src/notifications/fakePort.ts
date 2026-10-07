/** Porta falsa para os testes (Node): guarda tudo na memória e registra a ordem das chamadas em `calls`. */
import type {
  CategorySpec,
  NotificationRequest,
  NotificationResponse,
  NotificationsPort,
  PermissionState,
  PresentedNotification,
  ScheduledRequest,
} from "./port";

export interface FakePort extends NotificationsPort {
  calls: string[];
  scheduled: Map<string, ScheduledRequest>;
  presented: Map<string, NotificationRequest & { deliveredAt: number }>;
  categories: CategorySpec[];
  permission: PermissionState;
  lastResponse: NotificationResponse | null;
  emit(response: NotificationResponse): void;
  /** Para testar que a ordem das chamadas importa. */
  failScheduleOnce: boolean;
}

export function createFakePort(permission: PermissionState = "granted"): FakePort {
  const listeners = new Set<(r: NotificationResponse) => void>();
  const port: FakePort = {
    calls: [],
    scheduled: new Map(),
    presented: new Map(),
    categories: [],
    permission,
    lastResponse: null,
    failScheduleOnce: false,
    emit: (response) => listeners.forEach((l) => l(response)),
    async getPermission() {
      port.calls.push("getPermission");
      return port.permission;
    },
    async requestPermission() {
      port.calls.push("requestPermission");
      if (port.permission === "undetermined") port.permission = "granted";
      return port.permission;
    },
    async scheduleAt(request) {
      port.calls.push(`scheduleAt:${request.id}`);
      if (port.failScheduleOnce) {
        port.failScheduleOnce = false;
        throw new Error("falha ao agendar");
      }
      port.scheduled.set(request.id, request);
    },
    async cancelAllScheduled() {
      port.calls.push("cancelAllScheduled");
      port.scheduled.clear();
    },
    async cancelScheduled(id) {
      port.calls.push(`cancelScheduled:${id}`);
      port.scheduled.delete(id);
    },
    async listScheduled() {
      return [...port.scheduled.values()];
    },
    async listPresented(): Promise<PresentedNotification[]> {
      return [...port.presented.entries()].map(([id, p]) => ({ id, deliveredAt: p.deliveredAt, data: p.data }));
    },
    async present(request) {
      port.calls.push(`present:${request.id}`);
      port.presented.set(request.id, { ...request, deliveredAt: 0 });
    },
    async dismissPresented(id) {
      port.calls.push(`dismissPresented:${id}`);
      port.presented.delete(id);
    },
    async setCategories(categories) {
      port.calls.push("setCategories");
      port.categories = categories;
    },
    showInForeground() {
      port.calls.push("showInForeground");
    },
    async getLastResponse() {
      return port.lastResponse;
    },
    onResponse(listener) {
      port.calls.push("onResponse");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return port;
}
