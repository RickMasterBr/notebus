/** Itinerário de uma rota (a maior variante), alinhamento das viagens e horários de controle. */
import type { GenError, GtfsFeed, Warning } from "./types.ts";

export interface RouteTrip {
  tripId: string;
  servico: string;
  firstPosition: number;
  lastPosition: number;
  /** Só as paragens de controle, em minutos de serviço. */
  times: { position: number; serviceMinute: number }[];
}

export interface RouteAnalysis {
  /** `id` das paragens do feed, na ordem do itinerário (posição = índice + 1). */
  itinerary: string[];
  trips: RouteTrip[];
  /** Posições (1…n) onde alguma viagem aceita tem controle. */
  timepoints: Set<number>;
  errors: GenError[];
  warnings: Warning[];
}

/** "06:41:34" → 402 (minuto mais próximo); "25:41:00" → 1541. `null` se não for hora. */
export function serviceMinuteOf(hora: string): number | null {
  const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(hora.trim());
  return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) / 60) : null;
}

/** Posições (1…n) do itinerário que casam com `stops` como subsequência em ordem, da esquerda; `null` se não casa. */
export function alignToItinerary(itinerary: readonly string[], stops: readonly string[]): number[] | null {
  const positions: number[] = [];
  let at = 0;
  for (const stop of stops) {
    while (at < itinerary.length && itinerary[at] !== stop) at++;
    if (at === itinerary.length) return null;
    positions.push(++at);
  }
  return positions;
}

const warn = (code: string, message: string, items: string[]): Warning => ({ code, message, items });

export function analyzeRoute(feed: GtfsFeed, routeId: string): RouteAnalysis {
  const out: RouteAnalysis = { itinerary: [], trips: [], timepoints: new Set(), errors: [], warnings: [] };
  const trips = feed.viagens.filter((v) => v.rota === routeId);
  const ids = new Set(trips.map((v) => v.id));
  const byTrip = new Map<string, GtfsFeed["horarios"]>();
  for (const h of feed.horarios) if (ids.has(h.viagem)) byTrip.set(h.viagem, [...(byTrip.get(h.viagem) ?? []), h]);
  for (const list of byTrip.values()) list.sort((a, b) => a.sequencia - b.sequencia);

  const sequences = trips.map((v) => ({ trip: v, stops: (byTrip.get(v.id) ?? []).map((h) => h.parada) }));
  const longest = Math.max(0, ...sequences.map((s) => s.stops.length));
  if (longest === 0) {
    out.errors.push(warn("ROTA_SEM_VIAGENS", `rota ${routeId} sem viagens com horários`, [routeId]));
    return out;
  }
  const candidates = new Set(sequences.filter((s) => s.stops.length === longest).map((s) => s.stops.join("\u0000")));
  if (candidates.size > 1) {
    out.errors.push(warn("ITINERARIO_EMPATADO", `rota ${routeId}: ${candidates.size} sequências com ${longest} paragens`, [routeId]));
    return out;
  }
  out.itinerary = sequences.find((s) => s.stops.length === longest)!.stops;

  const notAligned: string[] = [];
  const noControl: string[] = [];
  const badTime: string[] = [];
  let skipped = 0;
  for (const { trip, stops } of sequences) {
    const positions = alignToItinerary(out.itinerary, stops);
    if (!positions) {
      notAligned.push(trip.id);
      continue;
    }
    const rows = byTrip.get(trip.id)!;
    if (rows.length < 2 || !rows[0]!.controle || !rows[rows.length - 1]!.controle) {
      noControl.push(trip.id);
      continue;
    }
    const times: RouteTrip["times"] = [];
    rows.forEach((h, i) => {
      const minute = h.controle ? serviceMinuteOf(h.hora) : 0;
      if (minute === null) badTime.push(`${trip.id}: ${h.hora}`);
      else if (h.controle) times.push({ position: positions[i]!, serviceMinute: minute });
    });
    if (times.length === 0 || badTime.some((b) => b.startsWith(`${trip.id}: `))) continue;
    if (stops.length < out.itinerary.length) skipped++;
    for (const t of times) out.timepoints.add(t.position);
    out.trips.push({
      tripId: trip.id,
      servico: trip.servico,
      firstPosition: positions[0]!,
      lastPosition: positions[positions.length - 1]!,
      times,
    });
  }
  if (notAligned.length) out.warnings.push(warn("VARIANTE_NAO_ALINHA", `rota ${routeId}: viagem fora do itinerário, não entra`, notAligned));
  if (noControl.length) out.warnings.push(warn("SEM_CONTROLE_NAS_PONTAS", `rota ${routeId}: viagem sem controle nas duas pontas, não entra`, noControl));
  if (badTime.length) out.warnings.push(warn("HORA_INVALIDA", `rota ${routeId}: hora de controle ilegível, viagem não entra`, badTime));
  if (skipped) out.warnings.push(warn("PARADAS_PULADAS", "viagens que pulam paragens do itinerário (horário interpolado no app)", [`${routeId}: ${skipped}`]));
  return out;
}
