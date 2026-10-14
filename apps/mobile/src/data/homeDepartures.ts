/**
 * Leitura e preparação dos avisos de saída agendados e entregues para a frase viva (E-08.5 Bloco 17, Item 2).
 * Função pura: sem ler o relógio diretamente, sem expo-*.
 */
import { lisbonWallClock } from "@notebus/domain";
import { readDeparture } from "../notifications/payload";
import type { NotificationData, PresentedNotification, ScheduledRequest } from "../notifications/port";
import type { PhraseDeparture } from "./homePhrase";

export interface DeparturesFromNotificationsInput {
  scheduled: readonly ScheduledRequest[];
  presented: readonly PresentedNotification[];
  now: number;
}

function parseBusTime(busTime: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(busTime)) return null;
  const h = Number(busTime.slice(0, 2));
  const m = Number(busTime.slice(3, 5));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function departuresFromNotifications({
  scheduled,
  presented,
  now,
}: DeparturesFromNotificationsInput): PhraseDeparture[] {
  // 1. Junte os dois conjuntos.
  const allItems: Array<{ id: string; data: NotificationData | null | undefined }> = [
    ...scheduled.map((s) => ({ id: s.id, data: s.data })),
    ...presented.map((p) => ({ id: p.id, data: p.data })),
  ];

  const mapByEventId = new Map<string, PhraseDeparture>();

  for (const item of allItems) {
    if (!item.data) continue;
    // Descarta aviso de teste (id começando com test:)
    if (item.id.startsWith("test:")) continue;

    const payload = readDeparture(item.data);
    if (!payload) continue;
    // Descarta aviso de teste (payload.test === true)
    if (payload.test) continue;

    // 2. busAt pela fórmula (virada de meia-noite incluída)
    const busMinuto = parseBusTime(payload.busTime);
    if (busMinuto === null) continue;

    const minutoLisboa = lisbonWallClock(payload.beAtStopAt).minute;
    const diffMinutes = (busMinuto - minutoLisboa + 1440) % 1440;
    const busAt = payload.beAtStopAt + diffMinutes * 60_000;

    // 3. Descarte o que tem busAt <= now (o ônibus já passou)
    if (busAt <= now) continue;

    const departure: PhraseDeparture = {
      lineId: payload.lineId,
      lineCode: payload.lineCode,
      stopName: payload.stopName,
      placeId: payload.placeId,
      beAtStopAt: payload.beAtStopAt,
      busAt,
    };

    // 4. Dedupe por payload.eventId: entre iguais, fica o de menor busAt
    const existing = mapByEventId.get(payload.eventId);
    if (!existing || departure.busAt < existing.busAt) {
      mapByEventId.set(payload.eventId, departure);
    }
  }

  // 5. Devolva ordenado por busAt
  return Array.from(mapByEventId.values()).sort((a, b) => a.busAt - b.busAt);
}
