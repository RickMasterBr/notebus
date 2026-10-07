/**
 * O que cada notificação carrega no `data` (E-06 §4): o tratador, que pode rodar sem nenhuma tela, não consulta mais nada.
 * Os dois lados (montar e ler) vivem aqui para não divergirem.
 */
import type { NotificationData } from "./port";

/** O aviso de saída (agendado, adiado ou de teste). */
export interface DeparturePayload {
  /** `"{alarmId}:{serviceDate}"`, ou `"test:{instante}"` no aviso de teste. É o `id` da linha de `alarm_event`. */
  eventId: string;
  stopId: string;
  lineId: string;
  tripId: string;
  /** "Esteja no ponto às", epoch ms. */
  beAtStopAt: number;
  lineCode: string;
  stopName: string;
  /** "HH:MM" do ônibus e de "esteja lá" (para o texto do "Adiar"). */
  busTime: string;
  arriveTime: string;
  /** O lugar de destino da opção (o toque no corpo abre a TL-04 dele). */
  placeId: string;
  test: boolean;
}

export function departureData(p: DeparturePayload): NotificationData {
  return { kind: "departure", ...p };
}

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function readDeparture(data: NotificationData): DeparturePayload | null {
  const eventId = text(data.eventId);
  const stopId = text(data.stopId);
  const lineId = text(data.lineId);
  const tripId = text(data.tripId);
  const lineCode = text(data.lineCode);
  const stopName = text(data.stopName);
  const busTime = text(data.busTime);
  const arriveTime = text(data.arriveTime);
  if (data.kind !== "departure" || !eventId || !stopId || !lineId || !tripId || !lineCode || !stopName || !busTime || !arriveTime) return null;
  if (typeof data.beAtStopAt !== "number") return null;
  return {
    eventId,
    stopId,
    lineId,
    tripId,
    beAtStopAt: data.beAtStopAt,
    lineCode,
    stopName,
    busTime,
    arriveTime,
    placeId: text(data.placeId) ?? "",
    test: data.test === true,
  };
}

/** A confirmação do embarque (D-102): o `BoardToken` vai inteiro, porque o processo pode ter sido encerrado. */
export interface ConfirmPayload {
  /** O evento do aviso que originou o embarque (para a dedução do Desfazer). */
  eventId: string;
  observationId: string;
  rideId: string;
  reopenedRideIds: string[];
}

export function confirmData(p: ConfirmPayload): NotificationData {
  return { kind: "confirm", eventId: p.eventId, observationId: p.observationId, rideId: p.rideId, reopened: JSON.stringify(p.reopenedRideIds) };
}

export function readConfirm(data: NotificationData): ConfirmPayload | null {
  const eventId = text(data.eventId);
  const observationId = text(data.observationId);
  const rideId = text(data.rideId);
  if (data.kind !== "confirm" || !eventId || !observationId || !rideId || typeof data.reopened !== "string") return null;
  try {
    const reopened: unknown = JSON.parse(data.reopened);
    if (!Array.isArray(reopened) || !reopened.every((x) => typeof x === "string")) return null;
    return { eventId, observationId, rideId, reopenedRideIds: reopened as string[] };
  } catch {
    return null;
  }
}
