/**
 * Porta fina para o módulo de notificações (E-06 §4, T-57): tudo o que o app usa do `expo-notifications`, com tipos
 * próprios. Só `expoPort.ts` importa o módulo nativo; o que roda no Node dos testes usa uma porta falsa.
 */

export type PermissionState = "granted" | "denied" | "undetermined";

export interface ActionSpec {
  id: string;
  title: string;
  /** `true` abre o app ao tocar (só o "Ajustar" da confirmação). */
  opensApp: boolean;
}

export interface CategorySpec {
  id: string;
  actions: ActionSpec[];
}

/** O que viaja dentro da notificação: o tratador não consulta mais nada (ver `scheduler.ts`). */
export type NotificationData = Record<string, string | number | boolean | null>;

export interface NotificationRequest {
  /** Identificador determinístico (agendada) ou da confirmação. */
  id: string;
  title: string;
  body: string;
  categoryId: string;
  data: NotificationData;
}

export interface ScheduledRequest extends NotificationRequest {
  /** Instante do aviso (epoch ms UTC). */
  at: number;
}

/** Uma notificação já entregue (na central) ou o alvo de uma resposta. `deliveredAt` já em milissegundos. */
export interface PresentedNotification {
  id: string;
  deliveredAt: number;
  data: NotificationData;
}

/** A resposta do usuário: `default` é o toque no corpo; senão, o `id` da ação. */
export interface NotificationResponse {
  actionId: string;
  notification: PresentedNotification;
}

export interface NotificationsPort {
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  scheduleAt(request: ScheduledRequest): Promise<void>;
  cancelAllScheduled(): Promise<void>;
  cancelScheduled(id: string): Promise<void>;
  listScheduled(): Promise<ScheduledRequest[]>;
  listPresented(): Promise<PresentedNotification[]>;
  /** Imediata (a confirmação do embarque). */
  present(request: NotificationRequest): Promise<void>;
  dismissPresented(id: string): Promise<void>;
  setCategories(categories: CategorySpec[]): Promise<void>;
  /** Com o app aberto, o aviso aparece e toca igual (o padrão do iOS seria calar). */
  showInForeground(): void;
  getLastResponse(): Promise<NotificationResponse | null>;
  /** Esquece a última resposta: sem isso, toda partida a frio a devolve de novo. */
  clearLastResponse(): Promise<void>;
  /** Devolve o `remove` do ouvinte. */
  onResponse(listener: (response: NotificationResponse) => void): () => void;
}

/** A ação do toque no corpo do aviso. */
export const DEFAULT_ACTION = "default";
