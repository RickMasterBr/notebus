/**
 * Conferências sobre o arquivo já montado: referências soltas (D-122: sem chave estrangeira,
 * então isto é obrigatório), IDs = UUIDv5 da chave (V8) e os números conhecidos da MOBILIS (V6).
 */
import { officialId } from "@notebus/domain/src/ids.ts";
import type { SeedFile } from "./types.ts";

/** Toda referência aponta para algo que existe no próprio arquivo. */
export function checkReferences(seed: SeedFile): string[] {
  const errors: string[] = [];
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const stops = ids(seed.stops);
  const lines = ids(seed.lines);
  const patterns = ids(seed.patterns);
  const patternStops = ids(seed.patternStops);
  const timetables = ids(seed.timetables);
  const trips = ids(seed.trips);
  const ref = (ok: boolean, what: string) => {
    if (!ok) errors.push(`referência solta: ${what}`);
  };
  for (const p of seed.patterns) ref(lines.has(p.lineId), `percurso ${p.key} → linha ${p.lineId}`);
  for (const ps of seed.patternStops) {
    ref(patterns.has(ps.patternId), `paragem de percurso ${ps.key} → percurso ${ps.patternId}`);
    ref(stops.has(ps.stopId), `paragem de percurso ${ps.key} → paragem ${ps.stopId}`);
  }
  for (const t of seed.timetables) ref(patterns.has(t.patternId), `quadro ${t.key} → percurso ${t.patternId}`);
  for (const t of seed.trips) ref(timetables.has(t.timetableId), `viagem ${t.key} → quadro ${t.timetableId}`);
  for (const st of seed.stopTimes) {
    ref(trips.has(st.tripId), `horário ${st.key} → viagem ${st.tripId}`);
    ref(patternStops.has(st.patternStopId), `horário ${st.key} → paragem de percurso ${st.patternStopId}`);
  }
  return errors;
}

/** V8: cada ID é o UUIDv5 da sua chave (D-086); importar de novo dá os mesmos IDs. */
export function checkIds(seed: SeedFile): string[] {
  const all = [seed.stops, seed.lines, seed.patterns, seed.patternStops, seed.timetables, seed.trips, seed.stopTimes];
  return all.flat().flatMap((x) => (x.id === officialId(x.key) ? [] : [`V8: ID de ${x.key} não é o UUIDv5 da chave`]));
}

/** V6: números conhecidos (Fase 1 §10). Só fazem sentido com os dados reais da MOBILIS. */
export function checkKnownNumbers(seed: SeedFile): string[] {
  const errors: string[] = [];
  const vig = seed.dataset.version;
  const byKey = new Map(seed.stopTimes.map((s) => [s.key, s.serviceMinute]));
  const tripByKey = new Map(seed.trips.map((t) => [t.key, t]));

  // T-01: L1 útil, viagem 06:40, pos. 2 = base 06:42 (entre pos. 1 e o próximo ponto de controle, a pos. 6).
  const t01 = `mobilis/${vig}/trip/L1/util/0640-p1`;
  const a = byKey.get(`${t01}/pos/1`);
  const b = byKey.get(`${t01}/pos/6`);
  if (a !== 400 || b === undefined || Math.floor(a + ((b - a) * 1) / 5) !== 402) {
    errors.push(`V6 (T-01): L1 útil 06:40, pos. 2 deveria ser 06:42 (pos. 1 = ${a}, pos. 6 = ${b})`);
  }

  // T-10: L9 sem viagens em agosto.
  const l9 = seed.patterns.find((p) => p.code === "L9");
  const l9Timetable = seed.timetables.find((t) => t.patternId === l9?.id);
  const l9Trips = seed.trips.filter((t) => t.timetableId === l9Timetable?.id);
  const august = (s: SeedFile["trips"][number]["season"]) => s?.mode === "exclude" && s.startMd <= "08-01" && s.endMd >= "08-31";
  if (l9Trips.length === 0 || !l9Trips.every((t) => august(t.season))) errors.push("V6 (T-10): L9 tem viagem em agosto");

  // T-09: L1 00:00 no sábado = 24:00 do dia de serviço de sábado.
  const t09 = `mobilis/${vig}/trip/L1/sab/2400-p1`;
  const trip = tripByKey.get(t09);
  if (!trip || !trip.dayTypes.includes("saturday") || byKey.get(`${t09}/pos/1`) !== 1440) {
    errors.push("V6 (T-09): L1 sábado 00:00 deveria ser a viagem 24:00 do sábado");
  }
  return errors;
}
