/**
 * Subtítulo "sair às HH:MM · [Lugar]" para o cartão "Perto de você" (E-05 §4.3, Bloco 3 item 3.3).
 *
 * Se o ponto sugerido tem tempo a pé cadastrado até algum lugar:
 * - Prioriza o lugar "Casa" (D-175, item 1); se não houver, o primeiro lugar associado.
 * - Usa o maior valor da faixa a pé (D-100) para calcular "sair às" a partir do "esteja no ponto às"
 *   do primeiro próximo ônibus.
 * - Formato neutro: `t("home.stop_card.leave_at_neutral", { time, place })` ("sair às 07:59 · Casa").
 */
import { formatServiceMinute } from "@notebus/domain";
import type { StopCard } from "./stopCard";
import { t } from "../i18n";

export interface PlaceRef {
  id: string;
  name: string;
  deletedAt: number | null;
}

export interface WalkTimeRef {
  stopId: string;
  placeId: string;
  minutesMin: number;
  minutesMax: number | null;
  deletedAt: number | null;
}

export function stopCardLeaveAtSubtitle(
  card: StopCard,
  places: readonly PlaceRef[],
  walkTimes: readonly WalkTimeRef[],
): string | null {
  const activeWalkTimes = walkTimes.filter(
    (w) => w.stopId === card.stopId && w.deletedAt === null,
  );
  if (activeWalkTimes.length === 0) return null;

  const activePlacesMap = new Map<string, PlaceRef>();
  for (const p of places) {
    if (p.deletedAt === null) activePlacesMap.set(p.id, p);
  }

  // Encontra os pares (walkTime, place)
  const pairs: { walkTime: WalkTimeRef; place: PlaceRef }[] = [];
  for (const wt of activeWalkTimes) {
    const p = activePlacesMap.get(wt.placeId);
    if (p) pairs.push({ walkTime: wt, place: p });
  }

  if (pairs.length === 0) return null;

  // Prioriza Casa (D-175), se não houver escolhe o primeiro
  const casaPair = pairs.find((pair) => pair.place.name.trim().toLowerCase() === "casa");
  const selected = casaPair ?? pairs[0];
  if (!selected) return null;

  // Encontra o primeiro ônibus com status "next"
  const nextLine = card.lines.find((l) => l.state.status === "next");
  if (!nextLine || nextLine.state.status !== "next") return null;

  const [hStr, mStr] = nextLine.state.beAtStop.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const beAtStopMinute = h * 60 + m;
  const walkMinutes = selected.walkTime.minutesMax ?? selected.walkTime.minutesMin;
  const leaveMinute = ((beAtStopMinute - walkMinutes) % 1440 + 1440) % 1440;
  const time = formatServiceMinute(leaveMinute);

  return t("home.stop_card.leave_at_neutral", { time, place: selected.place.name });
}
