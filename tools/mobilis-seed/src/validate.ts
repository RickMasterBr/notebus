/**
 * Conferências sobre o arquivo já montado: referências soltas e IDs = UUIDv5 da chave (V8) moram no domínio
 * (o app as repete ao importar); aqui ficam os números conhecidos da MOBILIS (V6).
 */
import type { SeedFile } from "./types.ts";

export { checkIds, checkReferences } from "@notebus/domain/src/seedFormat.ts";

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
